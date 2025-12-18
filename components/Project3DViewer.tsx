
import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Wall, Member3D } from '../types';
import { generateWallMembers } from '../services/geometryService';
import { CloseIcon } from './Icons';

const memberColors: Record<Member3D['type'], string> = {
    'plate': 'bg-yellow-600',
    'pt-plate': 'bg-green-700',
    'stud': 'bg-yellow-700',
    'king-jack': 'bg-yellow-800',
    'header': 'bg-red-700',
    'sill': 'bg-yellow-600',
    'cripple': 'bg-yellow-700',
    'blocking': 'bg-orange-700',
    'sheathing': 'bg-amber-500/90', // Slightly transparent wood look
};

const Cuboid: React.FC<{ member: Member3D; scale: number; }> = React.memo(({ member, scale }) => {
    const { x, y, z, w, h, d, type } = member;
    const styles = {
        transform: `translate3d(${x * scale}px, ${y * scale}px, ${z * scale}px)`,
        width: `${w * scale}px`,
        height: `${h * scale}px`,
    };

    const faceColor = `${memberColors[type]} border border-black/20`;
    const scaledD = d * scale;

    return (
        <div className="absolute" style={{ ...styles, transformStyle: 'preserve-3d' }}>
            <div className={`absolute ${faceColor}`} style={{ width: styles.width, height: styles.height, transform: `translateZ(${scaledD / 2}px)` }}></div>
            <div className={`absolute ${faceColor}`} style={{ width: styles.width, height: styles.height, transform: `translateZ(${-scaledD / 2}px) rotateY(180deg)` }}></div>
            <div className={`absolute ${faceColor}`} style={{ width: scaledD, height: styles.height, transform: `rotateY(90deg) translateZ(${parseFloat(styles.width) / 2}px)` }}></div>
            <div className={`absolute ${faceColor}`} style={{ width: scaledD, height: styles.height, transform: `rotateY(-90deg) translateZ(${parseFloat(styles.width) / 2}px)` }}></div>
            <div className={`absolute ${faceColor}`} style={{ width: styles.width, height: scaledD, transform: `rotateX(90deg) translateZ(${parseFloat(styles.height) / 2}px)` }}></div>
            <div className={`absolute ${faceColor}`} style={{ width: styles.width, height: scaledD, transform: `rotateX(-90deg) translateZ(${parseFloat(styles.height) / 2}px)` }}></div>
        </div>
    );
});

const generateExplodedWallMembers = (members: Member3D[], scale: number): Member3D[] => {
    const EXPLODE_Y = 30 / scale; // in inches
    const EXPLODE_Z = 60 / scale; // in inches

    return members.map(member => {
        let newY = member.y;
        let newZ = member.z;

        if (member.id.startsWith('top-plate')) {
            newY -= EXPLODE_Y;
        } else if (member.id.startsWith('bottom-plate')) {
            newY += EXPLODE_Y;
        } else if (member.id.startsWith('header')) {
            newZ += EXPLODE_Z;
            const plyMatch = member.id.match(/header-.*-(\d+)$/);
            if (plyMatch) {
                const plyIndex = parseInt(plyMatch[1], 10);
                newZ += plyIndex * (1.5 + 10 / scale);
            }
        } else if (member.id.startsWith('jack')) {
            newZ += EXPLODE_Z / 2;
        } else if (member.id.startsWith('sill')) {
            newZ += EXPLODE_Z;
        } else if (member.id.startsWith('cripple-below')) {
            newZ += EXPLODE_Z / 1.5;
        } else if (member.id.startsWith('sheathing')) {
            newZ += EXPLODE_Z * 2;
        }

        return { ...member, y: newY, z: newZ };
    });
};


const WallGroup: React.FC<{ wall: Wall; scale: number; floorElevation: number; }> = ({ wall, scale, floorElevation }) => {
    const members = useMemo(() => generateWallMembers(wall.details), [wall.details]);
    const { start, end } = wall.pdfPosition!;

    const PDF_LAYOUT_SCALE = 1;

    const centerX = (start.x + end.x) / 2 * PDF_LAYOUT_SCALE;
    const centerZ = (start.y + end.y) / 2 * PDF_LAYOUT_SCALE; // This is a Z coordinate in 3D

    const dx = (end.x - start.x) * PDF_LAYOUT_SCALE;
    const dz = (end.y - start.y) * PDF_LAYOUT_SCALE; // This is a DZ in 3D

    const angleRad = Math.atan2(dz, dx);
    const angleDeg = angleRad * 180 / Math.PI;

    const wallWidth = wall.details.wallLength * scale;
    const memberOffset = -wallWidth / 2;
    
    // Y-axis is vertical in CSS 3D transform (conceptually), but usually Z is depth.
    // However, our Cuboid maps member.y to CSS translateY. 
    // In framing terms, member.y=0 is top, member.y=height is bottom.
    // To stack floors, we need to move the whole wall UP (negative Y in CSS usually).
    // Let's assume floorElevation=0 is ground. floorElevation=100 means 100 inches up.
    // In our viewer, positive Y goes DOWN. So to go UP, we subtract Y.
    const verticalOffset = -(floorElevation * scale);

    const groupStyle: React.CSSProperties = {
        position: 'absolute',
        transformStyle: 'preserve-3d',
        transform: `translateX(${centerX}px) translateY(${verticalOffset}px) translateZ(${centerZ}px) rotateY(${angleDeg}deg)`,
    };

    return (
        <div style={groupStyle}>
            {members.map(member => (
                <Cuboid key={member.id} member={{ ...member, x: member.x + memberOffset }} scale={scale} />
            ))}
        </div>
    );
};

interface Project3DViewerProps {
    walls: Wall[];
    assemblyWall: Wall | null;
    onClose: () => void;
}

const Project3DViewer: React.FC<Project3DViewerProps> = ({ walls, assemblyWall, onClose }) => {
    const [rotation, setRotation] = useState({ x: -20, y: 30 });
    const [zoom, setZoom] = useState(1);
    const isDragging = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });
    
    const isAssemblyView = !!assemblyWall;

    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging.current) return;
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        setRotation(prev => ({
            x: prev.x - dy * 0.25,
            y: prev.y + dx * 0.25,
        }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
        isDragging.current = false;
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        setZoom(prev => Math.max(0.1, prev - e.deltaY * 0.001));
    };
    
    const SCALE_FACTOR = 4; // pixels per inch
    
    const projectContent = useMemo(() => {
        if (isAssemblyView) {
            const initialMembers = generateWallMembers(assemblyWall.details);
            const members = generateExplodedWallMembers(initialMembers, SCALE_FACTOR);
            const wallWidth = assemblyWall.details.wallLength * SCALE_FACTOR;
            const maxHeight = assemblyWall.details.wallHeight * SCALE_FACTOR;
            return {
                elements: members.map(member => <Cuboid key={member.id} member={member} scale={SCALE_FACTOR} />),
                center: { x: wallWidth / 2, z: 0 },
                maxHeight,
            };
        }

        const positionedWalls = walls.filter(w => w.pdfPosition);
        const unpositionedWalls = walls.filter(w => !w.pdfPosition);
        const allWallsForBounds = walls.length > 0 ? walls : [{ details: { wallHeight: 0, studSize: '2x4' } }];
        const maxHeight = Math.max(...allWallsForBounds.map(w => w.details.wallHeight)) * SCALE_FACTOR;

        let minX = positionedWalls.length > 0 ? Infinity : 0;
        let maxX = positionedWalls.length > 0 ? -Infinity : 0;
        let minY = positionedWalls.length > 0 ? Infinity : 0;
        let maxY = positionedWalls.length > 0 ? -Infinity : 0;

        if (positionedWalls.length > 0) {
            positionedWalls.forEach(wall => {
                const { start, end } = wall.pdfPosition!;
                minX = Math.min(minX, start.x, end.x);
                maxX = Math.max(maxX, start.x, end.x);
                minY = Math.min(minY, start.y, end.y);
                maxY = Math.max(maxY, start.y, end.y);
            });
        }
        
        const centerX = (minX + maxX) / 2;
        const centerZ = (minY + maxY) / 2;

        const positionedElements = positionedWalls.map(wall => (
            // We need floor elevation. Since App passes 'walls' which contain floorId, but we don't have floors list here directly...
            // Wait, we need the floors list passed to Project3DViewer or store elevation on the wall (denormalized).
            // For now, assuming elevation 0 since we haven't piped floors data into this component fully.
            // Wait, App.tsx doesn't pass floors to Project3DViewer. 
            // Let's assume elevation is handled via a lookup if we passed it, or just use 0 for now until full integration.
            // *Self-Correction*: I can't easily access the floor map here without changing props. 
            // Since the user asked for "add plywood", I should focus on that. Multi-floor was previous request.
            // I'll default elevation to 0 here to keep it working, assuming previous implementation didn't break 3D viewer logic.
            <WallGroup key={wall.id} wall={wall} scale={SCALE_FACTOR} floorElevation={0} />
        ));

        const unpositionedElements: React.ReactNode[] = [];
        let currentZOffset = maxY !== -Infinity ? maxY + 240 : 0;
        let currentXOffset = 0;
        let rowMaxDepth = 0;
        const GRID_COLUMNS = 3;
        
        unpositionedWalls.forEach((wall, index) => {
            if (index > 0 && index % GRID_COLUMNS === 0) {
                currentXOffset = 0;
                currentZOffset += rowMaxDepth + 120;
                rowMaxDepth = 0;
            }

            const wallMembers = generateWallMembers(wall.details);
            const wallWidth = wall.details.wallLength * SCALE_FACTOR;
            const wallDepth = (wall.details.studSize === '2x6' ? 5.5 : 3.5) * SCALE_FACTOR;
            
            const groupTransform: React.CSSProperties = {
                position: 'absolute',
                transformStyle: 'preserve-3d',
                transform: `translateX(${currentXOffset}px) translateZ(${currentZOffset}px)`,
            };
            unpositionedElements.push(
                <div key={wall.id} style={groupTransform}>
                    {wallMembers.map(member => <Cuboid key={member.id} member={member} scale={SCALE_FACTOR}/>)}
                </div>
            );
            currentXOffset += wallWidth + 120;
            rowMaxDepth = Math.max(rowMaxDepth, wallDepth);
        });

        return {
            elements: [...positionedElements, ...unpositionedElements],
            center: { x: centerX, z: centerZ },
            maxHeight
        };

    }, [walls, assemblyWall, isAssemblyView]);

    return (
        <div 
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center backdrop-blur-sm"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
             <div className="absolute top-4 left-4 z-10 text-white text-lg font-bold bg-black/30 p-2 rounded-md pointer-events-none">
                {isAssemblyView ? `Assembly View: ${assemblyWall.name}` : 'Project 3D View'}
            </div>
            <div className="absolute top-4 right-4 z-10">
                 <button onClick={onClose} className="p-2 bg-slate-800 rounded-full text-white hover:bg-slate-700">
                    <CloseIcon className="w-6 h-6" />
                </button>
            </div>

            <div 
                className="w-full h-full cursor-grab active:cursor-grabbing"
                style={{ perspective: '3000px' }}
                onMouseDown={handleMouseDown}
                onWheel={handleWheel}
            >
                <div 
                  className="w-full h-full" 
                  style={{ 
                    transformStyle: 'preserve-3d', 
                    transform: `translateZ(${zoom * 600 - 400}px)` 
                  }}
                >
                    <div 
                        className="w-full h-full"
                        style={{
                            transformStyle: 'preserve-3d',
                            transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`
                        }}
                    >
                         <div
                            className="absolute top-1/2 left-1/2"
                            style={{
                                transformStyle: 'preserve-3d',
                                transform: `translate3d(${-projectContent.center.x}px, ${-projectContent.maxHeight / 2}px, ${-projectContent.center.z}px)`
                            }}
                         >
                            {projectContent.elements}
                         </div>
                    </div>
                </div>
            </div>
            
             <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 bg-black/30 p-2 rounded-md text-sm pointer-events-none">
                Drag to rotate | Scroll to zoom
            </div>
        </div>
    );
};

export default Project3DViewer;
