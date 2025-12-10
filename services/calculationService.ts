
import type { Wall, MaterialItem, FramingMaterials, WallDetails, Opening, Floor } from '../types';
import { calculateOpeningLayouts } from './geometryService';

const PLATE_THICKNESS = 1.5;
const STUD_THICKNESS = 1.5;

const headerHeights: Record<string, number> = {
    '2x6': 5.5, '2x8': 7.25, '2x10': 9.25, '2x12': 11.25,
};

const DEFAULT_STOCK_LENGTHS = [192, 144, 120, 96];
const PRECUT_STUD_LENGTHS: Record<string, string> = {
    '92.625': "92 5/8\"", '104.625': "104 5/8\"",
};

// Helper to check for equality with a small epsilon for floating point safety
const isApprox = (val: number, target: number) => Math.abs(val - target) < 0.01;

function optimizeCuts(cuts: number[], stockLengths: number[]): { length: number; count: number }[] {
    const sortedCuts = [...cuts].sort((a, b) => b - a);
    const stockBins: { length: number; remaining: number }[] = [];

    for (const cut of sortedCuts) {
        let placed = false;
        for (const bin of stockBins) {
            if (cut <= bin.remaining) {
                bin.remaining -= cut;
                placed = true;
                break;
            }
        }
        if (!placed) {
            for (const stockLength of stockLengths.slice().reverse()) {
                if (cut <= stockLength) {
                    stockBins.push({ length: stockLength, remaining: stockLength - cut });
                    placed = true;
                    break;
                }
            }
        }
    }

    const result: Map<number, number> = new Map();
    stockBins.forEach(bin => {
        result.set(bin.length, (result.get(bin.length) || 0) + 1);
    });

    return Array.from(result.entries()).map(([length, count]) => ({ length, count }));
}

interface RawCuts {
    studCuts: { length: number; size: string }[];
    blockingCuts: { length: number; size: string }[];
    otherCuts: Record<string, number[]>; // Key: Description (e.g. '2x4 Plate'), Value: Array of lengths
    precut92: { count: number; size: string };
    precut104: { count: number; size: string };
}

// Generates the raw list of required cuts for a single wall without optimization
const calculateWallCuts = (details: WallDetails): RawCuts => {
    const raw: RawCuts = {
        studCuts: [],
        blockingCuts: [],
        otherCuts: {},
        precut92: { count: 0, size: details.studSize },
        precut104: { count: 0, size: details.studSize }
    };

    const addOtherCut = (desc: string, length: number) => {
        if (!raw.otherCuts[desc]) raw.otherCuts[desc] = [];
        raw.otherCuts[desc].push(length);
    };

    const wallLength = Math.round(details.wallLength);
    const { wallHeight, studSize, studSpacing, doubleTopPlate, pressureTreatedBottomPlate, studsOnCenter, openings, startStuds, endStuds, blockingRows, sheathing, sheathingType } = details;

    // Plates
    const topPlateMaterial = `${studSize} Plate`;
    const bottomPlateMaterial = pressureTreatedBottomPlate ? `${studSize} PT Plate` : `${studSize} Plate`;
    const numTopPlates = doubleTopPlate ? 2 : 1;
    for (let i = 0; i < numTopPlates; i++) addOtherCut(topPlateMaterial, wallLength);
    addOtherCut(bottomPlateMaterial, wallLength);

    // Sheathing
    if (sheathing) {
        const areaSqFt = (wallLength * wallHeight) / 144;
        addOtherCut(`${sheathingType} Sheet (4x8)`, areaSqFt);
    }

    // Studs Layout
    const topPlateHeight = (doubleTopPlate ? 2 : 1) * PLATE_THICKNESS;
    const bottomPlateHeight = PLATE_THICKNESS;
    const commonStudLength = wallHeight - topPlateHeight - bottomPlateHeight;

    // Use shared layout logic
    const openingLayouts = calculateOpeningLayouts(wallLength, openings);

    const studLayoutPositions = new Set<number>();
    const startStudCount = startStuds || 1;
    for (let i = 0; i < startStudCount; i++) {
        studLayoutPositions.add(Math.round((i * STUD_THICKNESS) * 100));
    }
    const endStudCount = endStuds || 1;
    for (let i = 0; i < endStudCount; i++) {
        studLayoutPositions.add(Math.round((wallLength - (i + 1) * STUD_THICKNESS) * 100));
    }
    for (let i = 1; (i * studSpacing) < wallLength; i++) {
        const studLayoutPosition = i * studSpacing;
        const baseLeft = studLayoutPosition - (studsOnCenter * STUD_THICKNESS / 2);
        if (baseLeft > (startStudCount - 1) * STUD_THICKNESS && baseLeft < wallLength - (endStudCount * STUD_THICKNESS)) {
            for (let j = 0; j < studsOnCenter; j++) {
                studLayoutPositions.add(Math.round((baseLeft + j * STUD_THICKNESS) * 100));
            }
        }
    }

    // Common Studs
    const allStudLengths: number[] = [];
    studLayoutPositions.forEach(xPosHundredths => {
        const xPos = xPosHundredths / 100;
        const studCenter = xPos + STUD_THICKNESS / 2;
        if (!openingLayouts.some(pos => studCenter > pos.xStart && studCenter < pos.xEnd)) {
            allStudLengths.push(commonStudLength);
        }
    });

    // Blocking
    if (blockingRows && blockingRows > 0) {
        const sortedStudPositions = Array.from(studLayoutPositions).sort((a, b) => a - b).map(p => p / 100);
        for (let i = 0; i < sortedStudPositions.length - 1; i++) {
            const currentPos = sortedStudPositions[i];
            const nextPos = sortedStudPositions[i + 1];
            const currentEnd = currentPos + STUD_THICKNESS;
            const gap = nextPos - currentEnd;
            if (gap > 3) {
                 const blockCenter = currentEnd + (gap / 2);
                 if (!openingLayouts.some(pos => blockCenter > pos.xStart && blockCenter < pos.xEnd)) {
                     for(let r=0; r < blockingRows; r++) {
                         raw.blockingCuts.push({ length: gap, size: studSize });
                     }
                 }
            }
        }
    }

    // Openings
    openingLayouts.forEach(layout => {
        const op = layout.opening;
        const headerLength = op.width + (op.jackStudsPerSide * STUD_THICKNESS * 2);

        // King and Jack studs
        const fullLengthStudsNeeded = (op.kingStudsPerSide * 2) + (op.jackStudsPerSide * 2);
        for(let j = 0; j < fullLengthStudsNeeded; j++) {
            allStudLengths.push(commonStudLength);
        }
        
        const headerHeight = headerHeights[op.headerSize];

        if (op.type === 'window') {
            addOtherCut(`${studSize} Plate`, headerLength); // Sill plate
            const crippleBelowLength = wallHeight - topPlateHeight - bottomPlateHeight - headerHeight - op.height - PLATE_THICKNESS;
            if(crippleBelowLength > 0){
                const numCripplePositions = Math.floor(headerLength / studSpacing);
                for (let k = 0; k < numCripplePositions; k++) {
                    allStudLengths.push(crippleBelowLength);
                }
            }
        } else if (op.type === 'door') {
            // Door cripples logic
            const topOfHeaderY = op.height + headerHeight;
            const bottomOfTopPlateY = wallHeight - topPlateHeight;
            const crippleAboveLength = bottomOfTopPlateY - topOfHeaderY;

            if (crippleAboveLength > 0) {
                    const numCripplePositions = Math.floor(headerLength / studSpacing);
                    for (let k = 0; k < numCripplePositions; k++) {
                    if (crippleAboveLength > 1) {
                        allStudLengths.push(crippleAboveLength);
                    }
                }
            }
        }

        const headerMaterialDesc = `${op.headerSize} Header`;
        for (let j = 0; j < op.headerPly; j++) addOtherCut(headerMaterialDesc, headerLength);
        
        if (op.headerPly > 1) {
            addOtherCut('1/2" Plywood Spacer', (op.headerPly - 1) * headerHeight * headerLength / 144);
        }
    });

    // Classify Studs
    allStudLengths.forEach(len => {
        if (isApprox(len, 92.625)) raw.precut92.count++;
        else if (isApprox(len, 104.625)) raw.precut104.count++;
        else raw.studCuts.push({ length: len, size: studSize });
    });

    return raw;
};

// Takes raw cuts and optimizes them into stock lengths
const processRawCuts = (raw: RawCuts): MaterialItem[] => {
    const list: MaterialItem[] = [];

    // Pre-cuts
    if (raw.precut92.count > 0) {
        list.push({ quantity: raw.precut92.count, description: `${raw.precut92.size} Pre-cut Studs`, length: PRECUT_STUD_LENGTHS['92.625'] });
    }
    if (raw.precut104.count > 0) {
        list.push({ quantity: raw.precut104.count, description: `${raw.precut104.size} Pre-cut Studs`, length: PRECUT_STUD_LENGTHS['104.625'] });
    }

    // Studs
    const studCutsBySize: Record<string, number[]> = {};
    raw.studCuts.forEach(c => {
        if (!studCutsBySize[c.size]) studCutsBySize[c.size] = [];
        studCutsBySize[c.size].push(c.length);
    });
    for (const size in studCutsBySize) {
        const cuts = studCutsBySize[size].map(c => Math.round(c * 1000) / 1000);
        optimizeCuts(cuts, DEFAULT_STOCK_LENGTHS).forEach(bin => {
            list.push({ description: `${size} Stud`, length: bin.length, quantity: bin.count });
        });
    }

    // Blocking
    const blockingCutsBySize: Record<string, number[]> = {};
    raw.blockingCuts.forEach(c => {
        if (!blockingCutsBySize[c.size]) blockingCutsBySize[c.size] = [];
        blockingCutsBySize[c.size].push(c.length);
    });
    for (const size in blockingCutsBySize) {
        const cuts = blockingCutsBySize[size].map(c => Math.round(c * 1000) / 1000);
        optimizeCuts(cuts, [192]).forEach(bin => {
            list.push({ description: `${size} Blocking`, length: bin.length, quantity: bin.count });
        });
    }

    // Other Materials
    for (const desc in raw.otherCuts) {
        if (desc.includes('Plywood') || desc.includes('Sheet (4x8)')) {
            const totalSqFt = raw.otherCuts[desc].reduce((a, b) => a + b, 0);
            if (totalSqFt > 0) {
                 list.push({ description: desc, length: 0, quantity: Math.ceil(totalSqFt / 32) });
            }
        } else {
            const allCuts = raw.otherCuts[desc];
            const processedCuts: number[] = [];
            allCuts.forEach(cut => {
                let remaining = cut;
                while (remaining > 192) {
                    processedCuts.push(192);
                    remaining -= 192;
                }
                if (remaining > 0) processedCuts.push(remaining);
            });
            
            if (processedCuts.length > 0) {
                let stockLengthsToUse = DEFAULT_STOCK_LENGTHS;
                // Headers and Plates prefer 16' (192") stock
                if (desc.includes('Plate') || desc.includes('Header')) {
                    stockLengthsToUse = [192];
                }
                
                optimizeCuts(processedCuts, stockLengthsToUse).forEach(bin => {
                    list.push({ description: desc, length: bin.length, quantity: bin.count });
                });
            }
        }
    }

    return list;
};

// Sorts the material list nicely
const sortMaterialList = (list: MaterialItem[]): MaterialItem[] => {
    const map = new Map<string, MaterialItem>();
    list.forEach(item => {
        const descriptionWithGrade = item.description.includes('Plywood') || item.description.includes('Sheet') ? item.description : 
                                     item.description.includes('Pre-cut') ? item.description :
                                     `${item.description} No. 2 or Better`;
        const key = `${descriptionWithGrade}-${item.length}`;
        if (map.has(key)) {
            map.get(key)!.quantity += item.quantity;
        } else {
            map.set(key, { ...item, description: descriptionWithGrade });
        }
    });

    return Array.from(map.values()).sort((a,b) => {
        const aIsStud = a.description.includes('Stud');
        const bIsStud = b.description.includes('Stud');
        if (aIsStud && !bIsStud) return -1;
        if (!aIsStud && bIsStud) return 1;
        return a.description.localeCompare(b.description);
    });
}

const calculateSingleWallMaterials = (details: WallDetails): MaterialItem[] => {
    const rawCuts = calculateWallCuts(details);
    const materialList = processRawCuts(rawCuts);
    return sortMaterialList(materialList);
};

// Reusable function to aggregate raw cuts from a list of walls
const aggregateRawCuts = (walls: Wall[]) => {
    const globalRawCuts: RawCuts = {
        studCuts: [],
        blockingCuts: [],
        otherCuts: {},
        precut92: { count: 0, size: '2x4' },
        precut104: { count: 0, size: '2x4' }
    };
    
    const precut92Map: Record<string, number> = {};
    const precut104Map: Record<string, number> = {};

    walls.forEach(wall => {
        const wallCuts = calculateWallCuts(wall.details);
        
        globalRawCuts.studCuts.push(...wallCuts.studCuts);
        globalRawCuts.blockingCuts.push(...wallCuts.blockingCuts);
        
        if (wallCuts.precut92.count > 0) precut92Map[wallCuts.precut92.size] = (precut92Map[wallCuts.precut92.size] || 0) + wallCuts.precut92.count;
        if (wallCuts.precut104.count > 0) precut104Map[wallCuts.precut104.size] = (precut104Map[wallCuts.precut104.size] || 0) + wallCuts.precut104.count;
        
        for(const [desc, lengths] of Object.entries(wallCuts.otherCuts)) {
            if(!globalRawCuts.otherCuts[desc]) globalRawCuts.otherCuts[desc] = [];
            globalRawCuts.otherCuts[desc].push(...lengths);
        }
    });

    const consolidatedList: MaterialItem[] = [];
    
    for(const [size, count] of Object.entries(precut92Map)) {
         consolidatedList.push({ quantity: count, description: `${size} Pre-cut Studs`, length: PRECUT_STUD_LENGTHS['92.625'] });
    }
    for(const [size, count] of Object.entries(precut104Map)) {
         consolidatedList.push({ quantity: count, description: `${size} Pre-cut Studs`, length: PRECUT_STUD_LENGTHS['104.625'] });
    }

    return { globalRawCuts, consolidatedList };
};

export const calculateProjectMaterials = (walls: Wall[], floors: Floor[]): Omit<FramingMaterials, 'proTip' | 'totalWalls' | 'totalLinearFeet'> => {
    const byWall: FramingMaterials['byWall'] = {};
    const byFloor: FramingMaterials['byFloor'] = {};
    
    // 1. Calculate Per-Wall Lists (Local Optimization)
    walls.forEach(wall => {
        byWall[wall.id] = {
            wallName: wall.name,
            materials: calculateSingleWallMaterials(wall.details),
        };
    });

    // 2. Calculate Per-Floor Lists (Floor Aggregation)
    floors.forEach(floor => {
        const floorWalls = walls.filter(w => w.floorId === floor.id || (!w.floorId && floor.id === floors[0].id));
        if (floorWalls.length > 0) {
            const { globalRawCuts, consolidatedList } = aggregateRawCuts(floorWalls);
            const optimizedBulk = processRawCuts({
                ...globalRawCuts,
                precut92: { count: 0, size: '2x4' },
                precut104: { count: 0, size: '2x4' }
            });
            byFloor[floor.id] = {
                floorName: floor.name,
                materials: sortMaterialList([...consolidatedList, ...optimizedBulk]),
            };
        }
    });

    // 3. Calculate Consolidated List (Global Optimization)
    const { globalRawCuts, consolidatedList } = aggregateRawCuts(walls);

    const optimizedBulk = processRawCuts({
        ...globalRawCuts,
        precut92: { count: 0, size: '2x4' },
        precut104: { count: 0, size: '2x4' }
    });

    const finalList = sortMaterialList([...consolidatedList, ...optimizedBulk]);

    return {
        list: finalList,
        byWall: byWall,
        byFloor: byFloor,
    };
};
