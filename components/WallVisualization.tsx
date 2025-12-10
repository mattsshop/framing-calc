
import React from 'react';
import type { WallDetails } from '../types';

const PLATE_THICKNESS = 1.5;
const STUD_THICKNESS = 1.5;

const headerHeights: { [key: string]: number } = {
  '2x6': 5.5,
  '2x8': 7.25,
  '2x10': 9.25,
  '2x12': 11.25,
};

interface WallVisualizationProps {
    details: WallDetails;
}

const FramingMember: React.FC<{left: number, top: number, width: number, height: number, color: string, key: string | number}> = ({left, top, width, height, color}) => (
    <div className={`absolute ${color}`} style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }}></div>
);

const formatLength = (totalInches: number) => {
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    const inchString = inches > 0.01 ? ` ${inches.toFixed(2).replace(/\.00$/, '').replace(/(\.\d[1-9])0$/, '$1')}"` : '';
    return `${feet}'${inchString}`;
};

const DimensionLine: React.FC<{ width: number, label: string }> = ({ width, label }) => (
    <div className="relative mb-4" style={{ width: `${width}px`, height: '24px' }}>
        <div className="absolute top-1/2 left-0 w-full border-t border-dashed border-slate-400"></div>
        <div className="absolute top-0 left-0 h-full w-px bg-slate-400"></div>
        <div className="absolute top-0 right-0 h-full w-px bg-slate-400"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+1px)] px-2 bg-slate-800 text-slate-300 text-sm font-mono">
            {label}
        </div>
    </div>
);


const WallVisualization: React.FC<WallVisualizationProps> = ({ details }) => {
    const { wallLength, wallHeight, studSpacing, openings, doubleTopPlate, studsOnCenter, startStuds, endStuds, blockingRows } = details;

    if (wallLength <= 0) {
        return <div className="text-center text-gray-500">Enter a valid wall length to see the visualization.</div>;
    }

    const canvasWidth = 800; // max width of the visualization area in pixels
    const scale = canvasWidth / wallLength;
    const canvasHeight = wallHeight * scale;

    const elements: React.ReactNode[] = [];

    const topPlateHeight = (doubleTopPlate ? 2 * PLATE_THICKNESS : PLATE_THICKNESS);
    const bottomPlateHeight = PLATE_THICKNESS;
    
    // Plates
    elements.push(<FramingMember key="top-plate" left={0} top={0} width={canvasWidth} height={topPlateHeight * scale} color={'bg-yellow-600'} />);
    elements.push(<FramingMember key="bottom-plate" left={0} top={canvasHeight - (bottomPlateHeight * scale)} width={canvasWidth} height={bottomPlateHeight * scale} color={details.pressureTreatedBottomPlate ? 'bg-green-700' : 'bg-yellow-600'} />);

    const studY = topPlateHeight * scale;
    const studW = STUD_THICKNESS * scale;
    
    const allOpenings = openings.filter(op => op.width > 0 && op.height > 0 && op.quantity > 0);
    const openingLayouts = allOpenings.flatMap(op => Array(op.quantity).fill(op));
    
    const totalOpeningFrameWidth = openingLayouts.reduce((acc, op) => {
        const frameWidthForOne = op.width + 2 * (op.kingStudsPerSide * STUD_THICKNESS) + 2 * (op.jackStudsPerSide * STUD_THICKNESS);
        return acc + frameWidthForOne;
    }, 0);

    const spacing = (wallLength - totalOpeningFrameWidth) > 0 ? (wallLength - totalOpeningFrameWidth) / (openingLayouts.length + 1) : 0;

    const openingPositions: {start: number, end: number}[] = [];
    let currentX = spacing;
    openingLayouts.forEach(opening => {
        const frameWidthForOne = opening.width + 2 * (opening.kingStudsPerSide * STUD_THICKNESS) + 2 * (opening.jackStudsPerSide * STUD_THICKNESS);
        openingPositions.push({ start: currentX, end: currentX + frameWidthForOne});
        currentX += frameWidthForOne + spacing;
    });

    // Common Studs Logic
    const studHeight = wallHeight - topPlateHeight - bottomPlateHeight;
    const studH = studHeight * scale;
    const studPositionsToDraw = new Set<number>();

    const startStudCount = startStuds || 1;
    for (let i = 0; i < startStudCount; i++) {
        studPositionsToDraw.add(i * STUD_THICKNESS);
    }
    
    const endStudCount = endStuds || 1;
    for (let i = 0; i < endStudCount; i++) {
        studPositionsToDraw.add(wallLength - (i + 1) * STUD_THICKNESS);
    }

    for (let i = 1; (i * studSpacing) < wallLength; i++) {
        const studLayoutPosition = i * studSpacing;
        const baseLeft = studLayoutPosition - (studsOnCenter * STUD_THICKNESS / 2);

        if (baseLeft > (startStudCount - 1) * STUD_THICKNESS && baseLeft < wallLength - (endStudCount * STUD_THICKNESS)) {
            for (let j = 0; j < studsOnCenter; j++) {
                studPositionsToDraw.add(baseLeft + j * STUD_THICKNESS);
            }
        }
    }
    
    const uniquePositions = Array.from(studPositionsToDraw).sort((a,b) => a - b);

    uniquePositions.forEach((xPos) => {
        const studCenter = xPos + STUD_THICKNESS / 2;
        if (!openingPositions.some(pos => studCenter >= pos.start && studCenter <= pos.end)) {
            elements.push(<FramingMember key={`stud-${xPos}`} left={xPos * scale} top={studY} width={studW} height={studH} color="bg-yellow-700" />);
        }
    });

    // Draw Blocking
    if (blockingRows && blockingRows > 0) {
        for (let i = 0; i < uniquePositions.length - 1; i++) {
            const currentX = uniquePositions[i];
            const nextX = uniquePositions[i + 1];
            const currentEnd = currentX + STUD_THICKNESS;
            const gap = nextX - currentEnd;

            if (gap > 3) {
                const blockCenter = currentEnd + (gap / 2);
                if (!openingPositions.some(pos => blockCenter > pos.start && blockCenter < pos.end)) {
                    for (let r = 1; r <= blockingRows; r++) {
                        const baseHeight = (wallHeight / (blockingRows + 1)) * r;
                        const staggerOffset = (i % 2 === 0) ? -1.5 : 1.5;
                        const yPos = baseHeight + staggerOffset;
                        
                        // Draw block as a small rectangle
                        elements.push(
                            <FramingMember 
                                key={`block-${currentX}-${r}`} 
                                left={currentEnd * scale} 
                                top={(topPlateHeight + yPos) * scale} 
                                width={gap * scale} 
                                height={1.5 * scale} 
                                color="bg-orange-700" 
                            />
                        );
                    }
                }
            }
        }
    }
    
    // Openings
    currentX = spacing;
    openingLayouts.forEach((opening, index) => {
        const openingId = `${(opening as any).id}-${index}`;
        const frameStart = currentX;

        // Calculate dimensions in inches first for clarity
        const kingStudsWidth = opening.kingStudsPerSide * STUD_THICKNESS;
        const jackStudsWidth = opening.jackStudsPerSide * STUD_THICKNESS;
        const headerLengthInches = opening.width + 2 * jackStudsWidth;
        const headerStartInches = frameStart + kingStudsWidth;
        const headerHeightInches = headerHeights[opening.headerSize];

        // Kings and Jacks
        for (let k = 0; k < opening.kingStudsPerSide; k++) {
            elements.push(<FramingMember key={`king-left-${openingId}-${k}`} left={(frameStart + k * STUD_THICKNESS) * scale} top={studY} width={studW} height={studH} color="bg-yellow-800" />);
        }
        for (let j = 0; j < opening.jackStudsPerSide; j++) {
            elements.push(<FramingMember key={`jack-left-${openingId}-${j}`} left={(frameStart + kingStudsWidth + j * STUD_THICKNESS) * scale} top={studY + (headerHeightInches * scale)} width={studW} height={studH - (headerHeightInches * scale)} color="bg-yellow-800/80" />);
        }
        
        const rightFrameStart = frameStart + kingStudsWidth + jackStudsWidth + opening.width;
        for (let j = 0; j < opening.jackStudsPerSide; j++) {
            elements.push(<FramingMember key={`jack-right-${openingId}-${j}`} left={(rightFrameStart + j * STUD_THICKNESS) * scale} top={studY + (headerHeightInches * scale)} width={studW} height={studH - (headerHeightInches * scale)} color="bg-yellow-800/80" />);
        }
        for (let k = 0; k < opening.kingStudsPerSide; k++) {
            elements.push(<FramingMember key={`king-right-${openingId}-${k}`} left={(rightFrameStart + jackStudsWidth + k * STUD_THICKNESS) * scale} top={studY} width={studW} height={studH} color="bg-yellow-800" />);
        }
        
        // Header
        const headerX = headerStartInches * scale;
        const headerW = headerLengthInches * scale;
        const headerH = headerHeightInches * scale;
        const headerY = topPlateHeight * scale;
        elements.push(<FramingMember key={`header-${openingId}`} left={headerX} top={headerY} width={headerW} height={headerH} color="bg-red-700" />);
        
        // Rough Opening visualization
        const roX = (frameStart + kingStudsWidth + jackStudsWidth) * scale;
        const roY = headerY + headerH;
        const roW = opening.width * scale;
        const roH = opening.height * scale;
        const isWindow = opening.type === 'window';
        elements.push(<div key={`ro-${openingId}`} className={`absolute ${isWindow ? 'bg-sky-400/30' : 'bg-orange-400/30'}`} style={{left: `${roX}px`, top: `${roY}px`, width: `${roW}px`, height: `${roH}px`}}></div>)

        if(isWindow){
            // Sill Plate
            const sillY = roY + roH;
            const sillH = PLATE_THICKNESS * scale;
            elements.push(<FramingMember key={`sill-${openingId}`} left={headerX} top={sillY} width={headerW} height={sillH} color="bg-yellow-600" />);

            // Cripples below sill
            const cripplesBelowY = sillY + sillH;
            const cripplesBelowH = canvasHeight - cripplesBelowY - (bottomPlateHeight * scale);
            let crippleXPos = Math.ceil(headerStartInches / studSpacing) * studSpacing;
             while (crippleXPos < headerStartInches + headerLengthInches) {
                 if (crippleXPos > headerStartInches && crippleXPos < headerStartInches + headerLengthInches) {
                    elements.push(<FramingMember key={`cripple-below-${openingId}-${crippleXPos}`} left={(crippleXPos - (STUD_THICKNESS/2)) * scale} top={cripplesBelowY} width={studW} height={cripplesBelowH} color="bg-yellow-700" />);
                 }
                crippleXPos += studSpacing;
            }
        }
        currentX += opening.width + 2 * (kingStudsWidth + jackStudsWidth) + spacing;
    });

    const dimensionLabel = formatLength(wallLength);

    return (
        <div className="mx-auto select-none" style={{ width: `${canvasWidth}px` }}>
            <DimensionLine width={canvasWidth} label={dimensionLabel} />
            <div className="relative w-full bg-slate-600" style={{ height: `${canvasHeight}px` }}>
                {elements}
            </div>
        </div>
    );
};

export default WallVisualization;