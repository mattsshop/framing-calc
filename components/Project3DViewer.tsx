import React, { useState, useRef, useMemo } from 'react';
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
    'sheathing': 'bg-amber-500/90',
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

interface Project3DViewerProps {
    isOpen: boolean;
    walls: Wall[];
    assemblyWall: Wall | null;
    onClose: () => void;
}

const Project3DViewer: React.FC<Project3DViewerProps> = ({ isOpen, walls, assemblyWall, onClose }) => {
    const [rotation, setRotation] = useState({ x: -20, y: 30 });
    const [zoom, setZoom] = useState(1);
    const isDragging = useRef(false);
    const lastMousePos = useRef({ x: 0, y: 0 });

    if (!isOpen) return null;

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
        setZoom(prev => Math.max(0.1, prev - e.deltaY * 0.001));
    };
    
    const SCALE_FACTOR = 4;
    
    const projectContent = useMemo(() => {
        const wallToDraw = assemblyWall || (walls.length > 0 ? walls[0] : null);
        if (!wallToDraw) return { elements: [], center: { x: 0, z: 0 }, maxHeight: 0 };

        const members = generateWallMembers(wallToDraw.details);
        const wallWidth = wallToDraw.details.wallLength * SCALE_FACTOR;
        const maxHeight = wallToDraw.details.wallHeight * SCALE_FACTOR;

        return {
            elements: members.map(member => <Cuboid key={member.id} member={member} scale={SCALE_FACTOR} />),
            center: { x: wallWidth / 2, z: 0 },
            maxHeight,
        };
    }, [walls, assemblyWall]);

    return (
        <div 
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center backdrop-blur-sm"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <div className="absolute top-4 right-4 z-10">
                 <button onClick={onClose} className="p-2 bg-slate-800 rounded-full text-white hover:bg-slate-700 transition-colors">
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
            
             <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 bg-black/30 p-2 rounded-md text-xs pointer-events-none uppercase tracking-widest">
                Drag to rotate | Scroll to zoom
            </div>
        </div>
    );
};

export default Project3DViewer;