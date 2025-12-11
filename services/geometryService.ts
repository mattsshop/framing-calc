
import type { WallDetails, Member3D, Opening } from '../types';

const PLATE_THICKNESS = 1.5;
const STUD_THICKNESS = 1.5;

const headerHeights: { [key: string]: number } = {
  '2x6': 5.5, '2x8': 7.25, '2x10': 9.25, '2x12': 11.25,
};

const studDepths: { [key: string]: number } = {
    '2x4': 3.5, '2x6': 5.5
};

const formatInchesForName = (inches: number): string => {
    const whole = Math.floor(inches);
    const fractionInches = inches - whole;
    if (Math.abs(fractionInches) < 0.01) {
        return `${whole}`;
    }
    const fractions = {
        '1/8': 0.125, '1/4': 0.25, '3/8': 0.375, '1/2': 0.5, '5/8': 0.625, '3/4': 0.75, '7/8': 0.875
    };
    for (const [key, value] of Object.entries(fractions)) {
        if (Math.abs(fractionInches - value) < 0.01) {
            return `${whole} ${key}`;
        }
    }
    return `${inches.toFixed(2)}`;
};

export interface PositionedOpening {
    opening: Opening;
    index: number; // index within the original quantity expansion if needed, or just unique index
    xStart: number;
    xEnd: number;
    center: number;
    frameWidth: number;
}

// Shared layout logic to determine exactly where openings sit on the wall
export const calculateOpeningLayouts = (wallLength: number, openings: Opening[]): PositionedOpening[] => {
    const positioned: PositionedOpening[] = [];
    
    // Filter valid openings
    const activeOpenings = openings.filter(op => op.quantity > 0 && op.width > 0);
    if (activeOpenings.length === 0) return [];

    const manualOpenings: PositionedOpening[] = [];
    const autoOpenings: Opening[] = [];

    activeOpenings.forEach(op => {
        if (op.centerOffset !== undefined && op.centerOffset !== null && !isNaN(op.centerOffset) && op.quantity === 1) {
            const frameWidth = op.width + 2 * (op.kingStudsPerSide * STUD_THICKNESS) + 2 * (op.jackStudsPerSide * STUD_THICKNESS);
            const xStart = op.centerOffset - (frameWidth / 2);
            manualOpenings.push({
                opening: op,
                index: 0,
                xStart,
                xEnd: xStart + frameWidth,
                center: op.centerOffset,
                frameWidth
            });
        } else {
            // If quantity > 1, we treat them all as auto for now to avoid stacking
            for(let i=0; i<op.quantity; i++) {
                autoOpenings.push(op);
            }
        }
    });

    // Sort manual openings by position
    manualOpenings.sort((a,b) => a.xStart - b.xStart);

    // Calculate Auto Spacing
    if (autoOpenings.length > 0) {
        const totalAutoWidth = autoOpenings.reduce((sum, op) => sum + op.width + 2 * (op.kingStudsPerSide * STUD_THICKNESS) + 2 * (op.jackStudsPerSide * STUD_THICKNESS), 0);
        
        // We simply flow auto openings in the available wall length, ignoring manual ones for collision for now (simpler MVP)
        const spacing = (wallLength - totalAutoWidth) / (autoOpenings.length + 1);
        let currentX = spacing;
        
        autoOpenings.forEach((op, idx) => {
            const frameWidth = op.width + 2 * (op.kingStudsPerSide * STUD_THICKNESS) + 2 * (op.jackStudsPerSide * STUD_THICKNESS);
            positioned.push({
                opening: op,
                index: idx,
                xStart: currentX,
                xEnd: currentX + frameWidth,
                center: currentX + (frameWidth / 2),
                frameWidth
            });
            currentX += frameWidth + spacing;
        });
    }

    // Combine
    return [...positioned, ...manualOpenings];
};


export const generateWallMembers = (details: WallDetails): Member3D[] => {
    const { wallLength, wallHeight, studSpacing, openings, doubleTopPlate, studsOnCenter, studSize, startStuds, endStuds, blockingRows, sheathing } = details;
    const members: Member3D[] = [];
    const studDepth = studDepths[studSize];

    const memberIdCounters: Record<string, number> = {};
    const getMemberData = (size: string, length: number, type: string): { id: string; name: string } => {
        const formattedLength = formatInchesForName(length);
        const name = `${size}x${formattedLength} ${type.charAt(0).toUpperCase() + type.slice(1)}`;
        const count = (memberIdCounters[name] || 0) + 1;
        memberIdCounters[name] = count;
        const id = `${name} ${count}`;
        return { id, name };
    };

    const topPlateHeight = (doubleTopPlate ? 2 * PLATE_THICKNESS : PLATE_THICKNESS);
    const bottomPlateHeight = PLATE_THICKNESS;

    // Plates
    const bottomPlateType = details.pressureTreatedBottomPlate ? 'pt-plate' : 'plate';
    const bottomPlateTypeName = bottomPlateType === 'pt-plate' ? 'PT Plate' : 'Plate';
    const bottomPlateData = getMemberData(studSize, wallLength, bottomPlateTypeName);
    members.push({ id: 'bottom-plate', name: bottomPlateData.name, x: 0, y: (wallHeight - bottomPlateHeight), z: 0, w: wallLength, h: bottomPlateHeight, d: studDepth, type: bottomPlateType });
    
    const topPlateData = getMemberData(studSize, wallLength, 'Plate');
    if(doubleTopPlate){
        members.push({ id: 'top-plate-1', name: topPlateData.name, x: 0, y: 0, z: 0, w: wallLength, h: PLATE_THICKNESS, d: studDepth, type: 'plate' });
        members.push({ id: 'top-plate-2', name: topPlateData.name, x: 0, y: PLATE_THICKNESS, z: 0, w: wallLength, h: PLATE_THICKNESS, d: studDepth, type: 'plate' });
    } else {
        members.push({ id: 'top-plate', name: topPlateData.name, x: 0, y: 0, z: 0, w: wallLength, h: topPlateHeight, d: studDepth, type: 'plate' });
    }
    
    const studHeight = wallHeight - topPlateHeight - bottomPlateHeight;
    
    // Calculate Layouts
    const openingLayouts = calculateOpeningLayouts(wallLength, openings);

    // Common Studs Logic
    const studPositionsToDraw: { x: number }[] = [];
    const startStudCount = startStuds || 1;
    for (let i = 0; i < startStudCount; i++) {
        studPositionsToDraw.push({ x: i * STUD_THICKNESS });
    }

    const endStudCount = endStuds || 1;
    for (let i = 0; i < endStudCount; i++) {
        studPositionsToDraw.push({ x: wallLength - (i + 1) * STUD_THICKNESS });
    }

    for (let i = 1; (i * studSpacing) < wallLength; i++) {
        const studLayoutPosition = i * studSpacing;
        const baseLeft = studLayoutPosition - (studsOnCenter * STUD_THICKNESS / 2);

        if (baseLeft > (startStudCount - 1) * STUD_THICKNESS && baseLeft < wallLength - (endStudCount * STUD_THICKNESS)) {
            for (let j = 0; j < studsOnCenter; j++) {
                studPositionsToDraw.push({ x: baseLeft + j * STUD_THICKNESS });
            }
        }
    }

    const uniquePositions = new Map<number, boolean>();
    studPositionsToDraw.forEach(p => {
        const roundedX = Math.round(p.x * 100) / 100;
        if (!uniquePositions.has(roundedX)) {
            uniquePositions.set(roundedX, true);
        }
    });

    const sortedUniqueXs = Array.from(uniquePositions.keys()).sort((a, b) => a - b);

    // Create Studs
    sortedUniqueXs.forEach((x) => {
        const studCenter = x + STUD_THICKNESS / 2;
        if (!openingLayouts.some(pos => studCenter > pos.xStart && studCenter < pos.xEnd)) {
            const { id, name } = getMemberData(studSize, studHeight, 'stud');
            members.push({ id, name, x, y: topPlateHeight, z: 0, w: STUD_THICKNESS, h: studHeight, d: studDepth, type: 'stud' });
        }
    });

    // Create Blocking
    if (blockingRows && blockingRows > 0) {
        for (let i = 0; i < sortedUniqueXs.length - 1; i++) {
            const currentX = sortedUniqueXs[i];
            const nextX = sortedUniqueXs[i+1];
            const currentEnd = currentX + STUD_THICKNESS;
            const gap = nextX - currentEnd;
            
            if (gap > 3) {
                 const blockCenter = currentEnd + (gap / 2);
                 if (!openingLayouts.some(pos => blockCenter > pos.xStart && blockCenter < pos.xEnd)) {
                     for (let r = 1; r <= blockingRows; r++) {
                         const baseHeight = (wallHeight / (blockingRows + 1)) * r;
                         const staggerOffset = (i % 2 === 0) ? -1.5 : 1.5;
                         const yPos = baseHeight + staggerOffset;

                         const { id, name } = getMemberData(studSize, gap, 'block');
                         members.push({ 
                             id, 
                             name, 
                             x: currentEnd, 
                             y: yPos, 
                             z: 0, 
                             w: gap, 
                             h: 1.5, 
                             d: studDepth, 
                             type: 'blocking' 
                         });
                     }
                 }
            }
        }
    }

    // Openings
    openingLayouts.forEach((layout, index) => {
        const { opening, xStart } = layout;
        const openingId = `${opening.id}-${index}`;
        const frameStart = xStart;
        const headerH = headerHeights[opening.headerSize];
        
        const leftKingStudsWidth = opening.kingStudsPerSide * STUD_THICKNESS;
        const leftJackStudsWidth = opening.jackStudsPerSide * STUD_THICKNESS;
        
        let headerYPos = topPlateHeight; 
        let jackHeight = studHeight - headerH;
        let crippleAboveHeight = 0;
        
        if (opening.type === 'door') {
             // Y = TotalWallHeight - BottomPlate - OpeningHeight - HeaderHeight
             // (Assuming Opening Height is from bottom plate up, so we subtract bottom plate)
             headerYPos = wallHeight - bottomPlateHeight - opening.height - headerH;
             
             crippleAboveHeight = headerYPos - topPlateHeight;
             if (crippleAboveHeight < 0) {
                 headerYPos = topPlateHeight;
                 crippleAboveHeight = 0;
             }
             jackHeight = opening.height; 
        } else if (opening.type === 'window') {
            // Apply header top offset (Header Drop)
            crippleAboveHeight = opening.headerTopOffset || 0;
            headerYPos = topPlateHeight + crippleAboveHeight;
            // Jack height is driven by where the header sits relative to the floor
            // But visually, the jack goes from bottom plate to bottom of header?
            // No, jack goes from bottom plate (or sill) to bottom of header.
            // Wait, window jacks usually sit on the sill? No, usually jacks go all the way up to header, and sill sits between them.
            // Actually, typical framing: Jacks run from Bottom Plate to Header. Sill sits between Jacks.
            // So Jack Height is bottom plate to header bottom.
            // height of jack = (headerYPos + headerHeight) - (wallHeight - bottomPlate) <-- invalid math direction.
            // Y is 0 at top. Bottom plate is at wallHeight - bottomPlateHeight.
            // Header Bottom Y is headerYPos + headerH.
            // So Jack Height = (wallHeight - bottomPlateHeight) - (headerYPos + headerH).
            jackHeight = (wallHeight - bottomPlateHeight) - (headerYPos + headerH);
            
            // Safety check for impossible geometry
            if (jackHeight < 0) jackHeight = 0;
        }

        // Kings and Jacks
        for (let k = 0; k < opening.kingStudsPerSide; k++) { // Left Kings
            const { id, name } = getMemberData(studSize, studHeight, 'king');
            members.push({ id, name, x: (frameStart + k * STUD_THICKNESS), y: topPlateHeight, z: 0, w: STUD_THICKNESS, h: studHeight, d: studDepth, type: 'king-jack' });
        }
        for (let j = 0; j < opening.jackStudsPerSide; j++) { // Left Jacks
             // For windows, we assume jack runs full height to header.
             const { id, name } = getMemberData(studSize, jackHeight, 'jack');
             const jackY = headerYPos + headerH;
             members.push({ id, name, x: (frameStart + leftKingStudsWidth + j * STUD_THICKNESS), y: jackY, z: 0, w: STUD_THICKNESS, h: jackHeight, d: studDepth, type: 'king-jack' });
        }
        
        const rightFrameStart = frameStart + leftKingStudsWidth + leftJackStudsWidth + opening.width;
        for (let j = 0; j < opening.jackStudsPerSide; j++) { // Right Jacks
             const { id, name } = getMemberData(studSize, jackHeight, 'jack');
             const jackY = headerYPos + headerH;
             members.push({ id, name, x: (rightFrameStart + j * STUD_THICKNESS), y: jackY, z: 0, w: STUD_THICKNESS, h: jackHeight, d: studDepth, type: 'king-jack' });
        }
        for (let k = 0; k < opening.kingStudsPerSide; k++) { // Right Kings
             const { id, name } = getMemberData(studSize, studHeight, 'king');
             members.push({ id, name, x: (rightFrameStart + leftJackStudsWidth + k * STUD_THICKNESS), y: topPlateHeight, z: 0, w: STUD_THICKNESS, h: studHeight, d: studDepth, type: 'king-jack' });
        }

        const headerStartX = frameStart + leftKingStudsWidth;
        const headerWidthInches = opening.width + 2 * leftJackStudsWidth;
        const headerName = `${opening.headerSize}x${formatInchesForName(headerWidthInches)} Header`;

        // Header
        const headerTotalDepth = opening.headerPly * 1.5 + (opening.headerPly > 1 ? (opening.headerPly -1) * 0.5 : 0);
        for (let p = 0; p < opening.headerPly; p++) {
            const plyZOffset = -(headerTotalDepth/2) + (p * (1.5 + 0.5)) + (1.5/2);
            members.push({ id: `header-${openingId}-${p}`, name: headerName, x: headerStartX, y: headerYPos, z: plyZOffset, w: headerWidthInches, h: headerH, d: 1.5, type: 'header' });
        }
        
        // Cripples Above
        if (crippleAboveHeight > 1.5) {
             let crippleXPos = Math.ceil(headerStartX / studSpacing) * studSpacing;
             while (crippleXPos < headerStartX + headerWidthInches) {
                 if (crippleXPos > headerStartX) {
                    const { id, name } = getMemberData(studSize, crippleAboveHeight, 'cripple');
                    members.push({ id, name, x: (crippleXPos - (STUD_THICKNESS / 2)), y: topPlateHeight, z: 0, w: STUD_THICKNESS, h: crippleAboveHeight, d: studDepth, type: 'cripple' });
                 }
                 crippleXPos += studSpacing;
             }
        }
        
        if (opening.type === 'window') {
            const sillY = headerYPos + headerH + opening.height;
            const sillName = `${studSize}x${formatInchesForName(headerWidthInches)} Sill Plate`;
            members.push({ id: `sill-${openingId}`, name: sillName, x: headerStartX, y: sillY, z: 0, w: headerWidthInches, h: PLATE_THICKNESS, d: studDepth, type: 'sill' });

            const cripplesBelowY = sillY + PLATE_THICKNESS;
            const cripplesBelowHeight = wallHeight - cripplesBelowY - bottomPlateHeight;
            
            if (cripplesBelowHeight > 0) {
                let crippleXPos = Math.ceil(headerStartX / studSpacing) * studSpacing;
                while (crippleXPos < headerStartX + headerWidthInches) {
                    if (crippleXPos > headerStartX) {
                        const { id, name } = getMemberData(studSize, cripplesBelowHeight, 'cripple');
                        members.push({ id, name, x: (crippleXPos - (STUD_THICKNESS / 2)), y: cripplesBelowY, z: 0, w: STUD_THICKNESS, h: cripplesBelowHeight, d: studDepth, type: 'cripple' });
                    }
                    crippleXPos += studSpacing;
                }
            }
        }
    });

    // Sheathing
    if (sheathing) {
        const PANEL_WIDTH = 48;
        const PANEL_HEIGHT = 96;
        const THICKNESS = 0.5; 

        let currentPanelX = 0;
        let panelCount = 1;
        while (currentPanelX < wallLength) {
            let width = PANEL_WIDTH;
            if (currentPanelX + width > wallLength) {
                width = wallLength - currentPanelX;
            }

            let currentPanelY = 0;
            while (currentPanelY < wallHeight) {
                let height = PANEL_HEIGHT;
                if (currentPanelY + height > wallHeight) {
                    height = wallHeight - currentPanelY;
                }
                
                const panelName = `Sheathing ${width.toFixed(1)}x${height.toFixed(1)}`;
                
                members.push({
                    id: `sheathing-${panelCount}`,
                    name: panelName,
                    x: currentPanelX,
                    y: currentPanelY,
                    z: studDepth, 
                    w: width,
                    h: height,
                    d: THICKNESS,
                    type: 'sheathing'
                });
                
                currentPanelY += height;
                panelCount++;
            }
            currentPanelX += PANEL_WIDTH;
        }
    }

    return members;
}