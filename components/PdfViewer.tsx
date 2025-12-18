
import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { CloseIcon, PlusIcon, ClipboardCopyIcon, ClipboardPasteIcon, ExternalLinkIcon, RulerIcon } from './Icons';
import type { Wall, Point } from '../types';

// Set worker to a reliable CDN matching the installed API version to avoid mismatch errors
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
    file: File;
    onClose: () => void;
    onAddWall: (name: string, lengthInInches: number, position: { start: Point; end: Point; pageNum: number; }) => void;
    projectWalls: Wall[];
    wallToPlace: Wall | null;
    onWallPlaced: (wallId: string, position: { start: Point; end: Point; pageNum: number; }, newLengthInches?: number) => void;
    highlightedWallId: string | null;
    clickedWallId: string | null;
    setClickedWallId: (id: string | null) => void;
    wallToFocusId: string | null;
    onFocusDone: () => void;
    onCopyWallDetails: (wallId: string) => void;
    onPasteWallDetails: () => void;
    selectedPdfWallIds: Set<string>;
    setSelectedPdfWallIds: (setter: React.SetStateAction<Set<string>>) => void;
    copiedLayout: { walls: Wall[], anchor: Point } | null;
    onCopyLayout: (wallIds: string[]) => void;
    onPasteLayout: (pastePoint: Point, pageNum: number) => void;
    currentPage: number;
    onPageChange: (pageNum: number) => void;
    activeScale?: number;
    onSetScale: (scale: number) => void;
    onDetach?: () => void;
    isDetached?: boolean;
}

type Mode = 'IDLE' | 'SETTING_SCALE_START' | 'SETTING_SCALE_END' | 'DRAWING_WALL' | 'PLACING_START' | 'PLACING_END' | 'PASTING';

const STUD_THICKNESS = 1.5;

const PageThumbnail: React.FC<{
    pdfDoc: any;
    pageNum: number;
    onClick: () => void;
}> = ({ pdfDoc, pageNum, onClick }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let isMounted = true;
        const render = async () => {
            if (!canvasRef.current || !isMounted) return;
            try {
                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1 });
                const canvas = canvasRef.current;
                const context = canvas.getContext('2d');
                if (!context) return;

                const scale = 150 / viewport.width; // Thumbnail width of 150px
                const scaledViewport = page.getViewport({ scale });

                canvas.height = scaledViewport.height;
                canvas.width = scaledViewport.width;
                
                // Draw white background to ensure transparency is handled correctly
                context.fillStyle = 'white';
                context.fillRect(0, 0, canvas.width, canvas.height);

                page.render({ canvasContext: context, viewport: scaledViewport });
            } catch (error) {
                console.error(`Failed to render page ${pageNum} thumbnail`, error);
            }
        };
        render();
        return () => { isMounted = false; };
    }, [pdfDoc, pageNum]);

    return (
        <div onClick={onClick} className="cursor-pointer p-2 border-2 border-transparent hover:border-indigo-500 rounded-lg transition text-center flex flex-col items-center">
            <canvas ref={canvasRef} className="bg-white shadow-lg rounded max-w-full"></canvas>
            <p className="mt-2 text-sm font-medium">Page {pageNum}</p>
        </div>
    );
};

const PageSelectorModal: React.FC<{
    pdfDoc: any;
    onSelect: (pageNum: number) => void;
    onClose: () => void;
}> = ({ pdfDoc, onSelect, onClose }) => {
    const pages = Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-800 rounded-lg shadow-2xl p-6 w-full max-w-4xl m-4 border border-slate-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Select a Page</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700"><CloseIcon className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                    {pages.map(pNum => (
                        <PageThumbnail 
                            key={pNum}
                            pdfDoc={pdfDoc}
                            pageNum={pNum}
                            onClick={() => onSelect(pNum)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

const PdfViewer: React.FC<PdfViewerProps> = ({ file, onClose, onAddWall, projectWalls, wallToPlace, onWallPlaced, highlightedWallId, clickedWallId, setClickedWallId, wallToFocusId, onFocusDone, onCopyWallDetails, onPasteWallDetails, selectedPdfWallIds, setSelectedPdfWallIds, copiedLayout, onCopyLayout, onPasteLayout, currentPage, onPageChange, activeScale, onSetScale, onDetach, isDetached }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [pdfDoc, setPdfDoc] = useState<any | null>(null);
    const [zoom, setZoom] = useState(1.5);
    const renderTaskRef = useRef<any>(null);

    const [mode, setMode] = useState<Mode>('IDLE');
    const [statusMessage, setStatusMessage] = useState('Loading PDF...');
    const [points, setPoints] = useState<Point[]>([]);
    const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
    const [mousePos, setMousePos] = useState<Point | null>(null);
    const [liveLength, setLiveLength] = useState<number | null>(null);
    
    const [normalizedDistance, setNormalizedDistance] = useState<number | null>(null);
    const [isScaleModalOpen, setIsScaleModalOpen] = useState(false);
    const [isPageSelectorOpen, setIsPageSelectorOpen] = useState(false);
    const [showWallNames, setShowWallNames] = useState(true);
    
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; wall: Wall } | null>(null);
    
    // Zoom Logic Refs
    const zoomTarget = useRef<{ xRatio: number; yRatio: number; mouseX: number; mouseY: number } | null>(null);
    
    const scaleRatio = activeScale || null;
    
    const wallsOnThisPage = useMemo(() =>
        projectWalls.filter(wall => wall.pdfPosition && wall.pdfPosition.pageNum === currentPage),
    [projectWalls, currentPage]);

    useEffect(() => {
        if (wallToPlace) {
            setMode('PLACING_START');
            setStatusMessage(`Place '${wallToPlace.name}': Click the START point.`);
            setPoints([]);
        } else {
            setMode(prev => prev.startsWith('PLACING') ? 'IDLE' : prev);
        }
    }, [wallToPlace]);
    
    useEffect(() => {
        if (wallToFocusId) {
            const wall = projectWalls.find(w => w.id === wallToFocusId);
            if (wall?.pdfPosition && wall.pdfPosition.pageNum !== currentPage) {
                onPageChange(wall.pdfPosition.pageNum);
            }
        }
    }, [wallToFocusId, projectWalls, currentPage, onPageChange]);

    // Wheel Zoom Listener
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();

            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const scrollX = container.scrollLeft;
            const scrollY = container.scrollTop;
            
            // Calculate ratio of mouse position relative to total content size
            const xRatio = (scrollX + x) / container.scrollWidth;
            const yRatio = (scrollY + y) / container.scrollHeight;

            zoomTarget.current = { xRatio, yRatio, mouseX: x, mouseY: y };

            const delta = -e.deltaY;
            setZoom(prev => {
                const factor = 0.1;
                let newZoom = prev + (delta > 0 ? prev * factor : -prev * factor);
                newZoom = Math.max(0.1, Math.min(5.0, newZoom));
                if (Math.abs(newZoom - 1.0) < 0.05) newZoom = 1.0;
                return newZoom;
            });
        };

        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, []);

    // Correct Scroll Position after Zoom
    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (container && zoomTarget.current) {
            const { xRatio, yRatio, mouseX, mouseY } = zoomTarget.current;
            
            const newScrollWidth = container.scrollWidth;
            const newScrollHeight = container.scrollHeight;

            container.scrollLeft = (newScrollWidth * xRatio) - mouseX;
            container.scrollTop = (newScrollHeight * yRatio) - mouseY;

            zoomTarget.current = null;
        }
    }, [zoom]);

    const renderPage = useCallback(async () => {
        if (!pdfDoc || !canvasRef.current) return;

        // Guard clause: Ensure the requested page number is valid for this document
        if (currentPage < 1 || currentPage > pdfDoc.numPages) {
            console.warn(`Skipping render: Invalid page ${currentPage} for document with ${pdfDoc.numPages} pages.`);
            return;
        }

        if (renderTaskRef.current) {
            try {
                renderTaskRef.current.cancel();
                await renderTaskRef.current.promise;
            } catch (error) {
                // RenderingCancelledException is expected
            }
            renderTaskRef.current = null;
        }

        try {
            const page = await pdfDoc.getPage(currentPage);
            
            if (!canvasRef.current) return;

            const viewport = page.getViewport({ scale: zoom });
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            if (!context) return;
            
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            const overlay = overlayRef.current;
            if (overlay) {
                overlay.height = viewport.height;
                overlay.width = viewport.width;
            }

            // Draw white background to ensure transparency is handled correctly
            context.fillStyle = 'white';
            context.fillRect(0, 0, canvas.width, canvas.height);

            const renderTask = page.render({ canvasContext: context, viewport });
            renderTaskRef.current = renderTask;

            await renderTask.promise;
        } catch (error: any) {
            if (error.name !== 'RenderingCancelledException') {
                console.error('Error rendering PDF page:', error);
                setStatusMessage('Error rendering page. Try adjusting zoom or changing pages.');
            }
        }
    }, [pdfDoc, currentPage, zoom]);
    
    const formatLength = (totalInches: number | null) => {
        if (totalInches === null) return '';
        const feet = Math.floor(totalInches / 12);
        const inches = (totalInches % 12);
        const inchString = inches > 0.01 ? ` ${inches.toFixed(1).replace(/\.0$/, '')}"` : '';
        return `${feet}'${inchString}`;
    };

    const drawOverlay = useCallback(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;
        const ctx = overlay.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, overlay.width, overlay.height);

        wallsOnThisPage.forEach(wall => {
            const { start, end } = wall.pdfPosition!;
            const isSelectedForBulk = selectedPdfWallIds.has(wall.id);
            const isHovered = wall.id === highlightedWallId;
            const isFocused = wall.id === wallToFocusId;
            const isClicked = wall.id === clickedWallId;

            const startX = start.x * zoom, startY = start.y * zoom, endX = end.x * zoom, endY = end.y * zoom;
            
            let strokeStyle = 'rgba(29, 78, 216, 0.9)'; 
            let currentLineWidth = 4;
            let textColor = 'white';
            let textBGColor = 'rgba(0, 0, 0, 0.7)';

            if (isHovered) { strokeStyle = 'rgba(250, 204, 21, 0.95)'; currentLineWidth = 6; textBGColor = 'rgba(50,50,0,0.8)'; textColor='yellow'; }
            if (isFocused) { strokeStyle = 'rgba(250, 204, 21, 0.95)'; currentLineWidth = 8; textBGColor = 'rgba(50,50,0,0.8)'; textColor='yellow'; }
            if (isSelectedForBulk) { strokeStyle = 'rgba(168, 85, 247, 0.95)'; currentLineWidth = 6; textBGColor='rgba(50,0,50,0.8)'; textColor='#e9d5ff'; }
            if (isClicked) { strokeStyle = 'rgba(34, 211, 238, 0.95)'; currentLineWidth = 8; textBGColor='rgba(0,50,50,0.8)'; textColor='#67e8f9'; }

            // Draw Wall Line
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = currentLineWidth;
            ctx.stroke();

            // --- Draw Openings ---
            if (wall.details.openings.length > 0) {
                 const dx = endX - startX;
                 const dy = endY - startY;
                 
                 // Unit vectors
                 const lengthPixels = Math.hypot(dx, dy);
                 const ux = lengthPixels > 0 ? dx / lengthPixels : 0;
                 const uy = lengthPixels > 0 ? dy / lengthPixels : 0;
                 
                 const wallLengthInches = wall.details.wallLength;
                 
                 if (wallLengthInches > 0) {
                    const allOpenings = wall.details.openings.filter(op => op.quantity > 0);
                    const openingLayouts = allOpenings.flatMap(op => Array(op.quantity).fill(op));
                    
                    const totalOpeningFrameWidth = openingLayouts.reduce((acc, op) => acc + op.width + 2 * (op.kingStudsPerSide * STUD_THICKNESS) + 2 * (op.jackStudsPerSide * STUD_THICKNESS), 0);
                    const spacing = (wallLengthInches - totalOpeningFrameWidth) > 0 ? (wallLengthInches - totalOpeningFrameWidth) / (openingLayouts.length + 1) : 0;
                    
                    let currentInches = spacing;
                    
                    openingLayouts.forEach(op => {
                         const framingSideWidth = (op.kingStudsPerSide * STUD_THICKNESS) + (op.jackStudsPerSide * STUD_THICKNESS);
                         const roStartInches = currentInches + framingSideWidth;
                         const roEndInches = roStartInches + op.width;
                         
                         const tStart = roStartInches / wallLengthInches;
                         const tEnd = roEndInches / wallLengthInches;
                         
                         // Calculate pixel positions
                         const roStartX = startX + dx * tStart;
                         const roStartY = startY + dy * tStart;
                         const roEndX = startX + dx * tEnd;
                         const roEndY = startY + dy * tEnd;
                         
                         // Draw Opening Marker
                         ctx.lineWidth = currentLineWidth + 2;
                         if (op.type === 'window') {
                             ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)'; // Sky blue for window
                         } else {
                             ctx.strokeStyle = 'rgba(251, 146, 60, 0.9)'; // Orange for door
                         }
                         
                         ctx.beginPath();
                         ctx.moveTo(roStartX, roStartY);
                         ctx.lineTo(roEndX, roEndY);
                         ctx.stroke();
                         
                         // Draw small perpendicular ticks at ends of RO
                         const perpX = -uy * 6;
                         const perpY = ux * 6;
                         
                         ctx.lineWidth = 2;
                         ctx.beginPath();
                         ctx.moveTo(roStartX - perpX, roStartY - perpY);
                         ctx.lineTo(roStartX + perpX, roStartY + perpY);
                         ctx.stroke();
                         
                         ctx.beginPath();
                         ctx.moveTo(roEndX - perpX, roEndY - perpY);
                         ctx.lineTo(roEndX + perpX, roEndY + perpY);
                         ctx.stroke();

                         // Advance
                         const frameWidth = op.width + 2 * framingSideWidth;
                         currentInches += frameWidth + spacing;
                    });
                 }
            }

            if (showWallNames) {
                const midX = (startX + endX) / 2, midY = (startY + endY) / 2;
                const text = `${wall.name} (${formatLength(wall.details.wallLength)})`;
                ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
                const textMetrics = ctx.measureText(text);
                const textBG = { w: textMetrics.width + 8, h: 22 };
                ctx.fillStyle = textBGColor;
                ctx.fillRect(midX - textBG.w / 2, midY - 8 - textBG.h/2, textBG.w, textBG.h);
                ctx.fillStyle = textColor;
                ctx.fillText(text, midX, midY - 8);
            }
        });

        const isPlacing = mode === 'PLACING_START' || mode === 'PLACING_END';
        const interactionColor = isPlacing ? 'rgba(168, 85, 247, 0.8)' : 'rgba(239, 68, 68, 0.8)'; 
        
        // Draw the rubber-banding line if we have a start point
        if (mode === 'DRAWING_WALL' && drawingPoints.length === 1 && mousePos) {
            ctx.beginPath();
            const startPt = drawingPoints[0];
            ctx.moveTo(startPt.x * zoom, startPt.y * zoom);
            ctx.lineTo(mousePos.x * zoom, mousePos.y * zoom);
            
            ctx.strokeStyle = interactionColor;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw start point
            ctx.beginPath();
            ctx.arc(startPt.x * zoom, startPt.y * zoom, 5, 0, 2 * Math.PI);
            ctx.fillStyle = interactionColor;
            ctx.fill();

            // Draw guidelines/extensions
            const lastPoint = startPt;
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, lastPoint.y * zoom);
            ctx.lineTo(overlay.width, lastPoint.y * zoom);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(lastPoint.x * zoom, 0);
            ctx.lineTo(lastPoint.x * zoom, overlay.height);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Show live length tooltip
            if (liveLength !== null) {
                const midX = (lastPoint.x + mousePos.x) / 2 * zoom;
                const midY = (lastPoint.y + mousePos.y) / 2 * zoom;
                ctx.font = 'bold 12px monospace';
                const label = formatLength(liveLength);
                const tm = ctx.measureText(label);
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillRect(midX + 10, midY - 20, tm.width + 8, 18);
                ctx.fillStyle = 'white';
                ctx.fillText(label, midX + 14, midY - 8);
            }
        }

        if (points.length > 0 && mode !== 'DRAWING_WALL') {
            const p1x = points[0].x * zoom, p1y = points[0].y * zoom;
            ctx.beginPath(); ctx.arc(p1x, p1y, 5, 0, 2 * Math.PI); ctx.fillStyle = interactionColor; ctx.fill();
            if (points.length > 1) {
                const p2x = points[1].x * zoom, p2y = points[1].y * zoom;
                ctx.beginPath(); ctx.moveTo(p1x, p1y); ctx.lineTo(p2x, p2y);
                ctx.strokeStyle = interactionColor; ctx.lineWidth = 2; ctx.stroke();
                ctx.beginPath(); ctx.arc(p2x, p2y, 5, 0, 2 * Math.PI); ctx.fill();
            }
        }
    }, [points, wallsOnThisPage, zoom, mode, highlightedWallId, clickedWallId, wallToFocusId, drawingPoints, mousePos, selectedPdfWallIds, showWallNames, liveLength]);

    useEffect(() => {
        if (!file) return;
        setStatusMessage('Reading PDF file...');
        const fileUrl = URL.createObjectURL(file);
        const loadingTask = pdfjsLib.getDocument(fileUrl);
        loadingTask.promise.then(
            (loadedPdf) => { 
                setPdfDoc(loadedPdf);
                onPageChange(1);
                setStatusMessage('PDF Loaded. Set the scale to begin measuring.');
                if (loadedPdf.numPages > 1) {
                    setIsPageSelectorOpen(true);
                }
            },
            (reason) => {
                console.error('Error during PDF loading:', reason);
                setStatusMessage(`Error loading PDF: ${reason?.message || 'Unknown error'}`);
            }
        );
        return () => {
            URL.revokeObjectURL(fileUrl);
        }
    }, [file, onPageChange]);

    useEffect(() => {
        renderPage().then(() => {
            drawOverlay();
            if (wallToFocusId) {
                const wall = projectWalls.find(w => w.id === wallToFocusId);
                if (wall?.pdfPosition?.pageNum === currentPage) {
                    const { start, end } = wall.pdfPosition;
                    const centerX = ((start.x + end.x) / 2) * zoom;
                    const centerY = ((start.y + end.y) / 2) * zoom;
                    scrollContainerRef.current?.scrollTo({
                        left: centerX - (scrollContainerRef.current.clientWidth / 2),
                        top: centerY - (scrollContainerRef.current.clientHeight / 2),
                        behavior: 'smooth',
                    });
                    onFocusDone();
                }
            }
        });

        return () => {
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
            }
        };
    }, [renderPage, drawOverlay, wallToFocusId, onFocusDone, projectWalls, currentPage, zoom]);

    const handleCancelInteraction = useCallback(() => {
        setDrawingPoints([]);
        setPoints([]);
        setMode('IDLE');
        setMousePos(null);
        setLiveLength(null);
        setStatusMessage('Action cancelled. Ready for next task.');
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleCancelInteraction();
            }
        };
        // Attach listener to the owner window (handles both main and popout cases)
        const win = scrollContainerRef.current?.ownerDocument?.defaultView || window;
        win.addEventListener('keydown', handleKeyDown);
        return () => win.removeEventListener('keydown', handleKeyDown);
    }, [handleCancelInteraction]);
    
     const getWallAtPoint = useCallback((clickPoint: Point): Wall | null => {
        const HIT_THRESHOLD = 15 / zoom;
        let closestWall: Wall | null = null;
        let minDistance = Infinity;

        for (const wall of wallsOnThisPage) {
            const v = wall.pdfPosition!.start;
            const w = wall.pdfPosition!.end;
            
            const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
            if (l2 === 0) {
                const dist = Math.hypot(clickPoint.x - v.x, clickPoint.y - v.y);
                 if (dist < minDistance) { minDistance = dist; closestWall = wall; }
                continue;
            }

            let t = ((clickPoint.x - v.x) * (w.x - v.x) + (clickPoint.y - v.y) * (w.y - v.y)) / l2;
            t = Math.max(0, Math.min(1, t));
            
            const closestPointOnSegment = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
            const dist = Math.hypot(clickPoint.x - closestPointOnSegment.x, clickPoint.y - closestPointOnSegment.y);
            
            if (dist < minDistance) { minDistance = dist; closestWall = wall; }
        }
        return minDistance < HIT_THRESHOLD ? closestWall : null;
    }, [wallsOnThisPage, zoom]);

     const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!overlayRef.current) return;
        const rect = overlayRef.current.getBoundingClientRect();
        // MousePos is already handled by move, but for click we need immediate point
        const rawPoint = { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };

        if (event.shiftKey) {
            const wall = getWallAtPoint(rawPoint);
            if (wall) {
                setSelectedPdfWallIds(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(wall.id)) newSet.delete(wall.id);
                    else newSet.add(wall.id);
                    return newSet;
                });
            }
            return;
        }
        
        // Use snapped mouse position if available for drawing
        const normalizedPoint = (mode === 'DRAWING_WALL' && mousePos) ? mousePos : rawPoint;
        
        if (mode === 'IDLE') {
            const wall = getWallAtPoint(normalizedPoint);
            if (wall) {
                setClickedWallId(wall.id);
            } else {
                setClickedWallId(null);
                setSelectedPdfWallIds(new Set());
            }
            return;
        }

        switch (mode) {
            case 'SETTING_SCALE_START':
                setPoints([normalizedPoint]); setMode('SETTING_SCALE_END');
                setStatusMessage('Click the END point of the known distance.');
                break;
            case 'SETTING_SCALE_END':
                const finalPoints = [...points, normalizedPoint]; setPoints(finalPoints);
                setNormalizedDistance(Math.hypot(finalPoints[1].x - finalPoints[0].x, finalPoints[1].y - finalPoints[0].y));
                setIsScaleModalOpen(true); setMode('IDLE');
                setStatusMessage('Enter the real-world length for the selection.');
                break;
            case 'DRAWING_WALL':
                const newPoints = [...drawingPoints, normalizedPoint];
                if (newPoints.length === 2) {
                    // Wall Complete - Create Immediately
                    const start = newPoints[0];
                    const end = newPoints[1];
                    const distance = Math.hypot(end.x - start.x, end.y - start.y);
                    if (scaleRatio && distance > 0) {
                         const lengthInInches = distance * scaleRatio;
                         const name = `Measured Wall ${projectWalls.length + 1}`;
                         onAddWall(name, lengthInInches, { start, end, pageNum: currentPage });
                    }
                    // Reset points to start new wall immediately
                    setDrawingPoints([]);
                    setStatusMessage('Wall created. Click start point for next wall, or Esc to stop.');
                } else {
                    // First point set
                    setDrawingPoints(newPoints);
                    setStatusMessage('Click the end point to finish this wall.');
                }
                break;
            case 'PLACING_START':
                setPoints([normalizedPoint]); setMode('PLACING_END');
                setStatusMessage(`Place '${wallToPlace!.name}': Click the END point.`);
                break;
            case 'PLACING_END':
                const placePoints = [...points, normalizedPoint];
                let newLengthInches: number | undefined = undefined;
                if (wallToPlace && scaleRatio) {
                    const pdfDistance = Math.hypot(placePoints[1].x - placePoints[0].x, placePoints[1].y - placePoints[0].y);
                    newLengthInches = pdfDistance * scaleRatio;
                }
                onWallPlaced(wallToPlace!.id, { start: placePoints[0], end: placePoints[1], pageNum: currentPage }, newLengthInches);
                setPoints([]); setMode('IDLE');
                setStatusMessage(`'${wallToPlace!.name}' placed. Ready for next task.`);
                break;
            case 'PASTING':
                onPasteLayout(normalizedPoint, currentPage);
                setMode('IDLE');
                setStatusMessage('Layout pasted successfully.');
                break;
        }
    };
    
     const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!overlayRef.current) return;
        const rect = overlayRef.current.getBoundingClientRect();
        const currentPointRaw = { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
        
        if (mode === 'DRAWING_WALL' && drawingPoints.length === 1) {
            let currentPoint = { ...currentPointRaw };
            const lastPoint = drawingPoints[0]; // Start point is index 0
            let dx = currentPoint.x - lastPoint.x;
            let dy = currentPoint.y - lastPoint.y;
            
            // 1. Ortho Snap: if strictly horizontal or vertical movement dominates
            if (Math.abs(dx) > Math.abs(dy)) {
                dy = 0;
            } else {
                dx = 0;
            }
            
            // 2. Length Snap: Snap to nearest inch if scale is available
            if (scaleRatio) {
                let distPixels = Math.hypot(dx, dy);
                let distInches = distPixels * scaleRatio;
                const snappedInches = Math.round(distInches);
                
                // Don't snap to 0 unless very close
                if (snappedInches > 0) {
                     const snappedPixels = snappedInches / scaleRatio;
                     if (dx !== 0) dx = Math.sign(dx) * snappedPixels;
                     if (dy !== 0) dy = Math.sign(dy) * snappedPixels;
                     
                     // Update live length for display
                     setLiveLength(snappedInches);
                } else {
                     setLiveLength(distInches);
                }
            }
            
            currentPoint.x = lastPoint.x + dx;
            currentPoint.y = lastPoint.y + dy;
            
            setMousePos(currentPoint);
        } else {
            setMousePos(null);
            setLiveLength(null);
        }
    };

    const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!overlayRef.current) return;
        event.preventDefault();
        const rect = overlayRef.current.getBoundingClientRect();
        const normalizedPoint = { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
        
        const wall = getWallAtPoint(normalizedPoint);
        if (wall) {
            setContextMenu({ x: event.clientX, y: event.clientY, wall });
        } else {
            setContextMenu(null);
        }
    };

    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        const win = scrollContainerRef.current?.ownerDocument?.defaultView || window;
        win.addEventListener('click', closeMenu);
        win.addEventListener('contextmenu', (e) => { if (!overlayRef.current?.contains(e.target as Node)) { closeMenu(); } }, true);
        return () => { win.removeEventListener('click', closeMenu); }
    }, []);
    
     const handleSetScaleClick = () => {
        setMode('SETTING_SCALE_START');
        setStatusMessage('Click the START point of a known distance on the plan.');
        setPoints([]);
    };

    const handleDrawWallClick = () => {
        if (!scaleRatio) { alert('Please set the scale first.'); return; }
        setMode('DRAWING_WALL');
        setStatusMessage('Click to start drawing a wall line.');
        setDrawingPoints([]);
    };

    const handleScaleSubmit = (ft: number, inches: number) => {
        const totalInches = (ft * 12) + inches;
        if (normalizedDistance && totalInches > 0) {
            const ratio = totalInches / normalizedDistance;
            onSetScale(ratio);
            setStatusMessage(`Scale set. Ready to measure.`);
        }
        setIsScaleModalOpen(false); setPoints([]);
    };

    const handleFinishDrawing = () => {
        // Mode reset only, wall creation now happens on click
        setDrawingPoints([]);
        setMousePos(null);
        setMode('IDLE');
        setLiveLength(null);
        setStatusMessage('Drawing mode exited.');
    };

    const handleCopySelection = () => {
        onCopyLayout(Array.from(selectedPdfWallIds));
        setStatusMessage(`${selectedPdfWallIds.size} walls copied. Click 'Paste' to place them.`);
    };

    const handlePasteSelection = () => {
        setMode('PASTING');
        setStatusMessage(`Click on the plan to place the copied layout.`);
    };
    
    const ScaleModal: React.FC<{onSet: (ft: number, inch: number) => void, onCancel: () => void}> = ({ onSet, onCancel }) => {
        const [ft, setFt] = useState(''); const [inch, setInch] = useState('');
        return (
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-800 p-6 rounded-lg shadow-2xl z-50 border border-slate-600">
                <h3 className="text-lg font-semibold mb-4">Set Scale</h3>
                <p className="text-sm text-slate-400 mb-3">Enter the real-world length of the line you drew.</p>
                <div className="flex gap-2">
                     <input type="number" placeholder="feet" value={ft} onChange={e => setFt(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"/>
                     <input type="number" placeholder="inches" value={inch} onChange={e => setInch(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"/>
                </div>
                <div className="flex justify-end gap-3 mt-4">
                    <button onClick={onCancel} className="px-4 py-2 bg-slate-600 rounded-md hover:bg-slate-500">Cancel</button>
                    <button onClick={() => onSet(parseInt(ft) || 0, parseFloat(inch) || 0)} className="px-4 py-2 bg-indigo-600 rounded-md hover:bg-indigo-700">Set</button>
                </div>
            </div>
        );
    };

    return (
        <div className="h-full w-full bg-slate-800 flex flex-col relative text-white border-r border-slate-700">
            {isScaleModalOpen && <ScaleModal onSet={handleScaleSubmit} onCancel={() => { setIsScaleModalOpen(false); setPoints([]); }} />}
            {isPageSelectorOpen && pdfDoc && (
                <PageSelectorModal 
                    pdfDoc={pdfDoc}
                    onSelect={(p) => {
                        onPageChange(p);
                        setIsPageSelectorOpen(false);
                    }}
                    onClose={() => setIsPageSelectorOpen(false)}
                />
            )}
            {contextMenu && (
                <div
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="absolute z-50 bg-slate-700 rounded-md shadow-lg p-2 border border-slate-600"
                >
                    <button
                        onClick={(e) => {
                             e.stopPropagation();
                            onCopyWallDetails(contextMenu.wall.id);
                            setStatusMessage(`'${contextMenu.wall.name}' details copied. Use Paste from main list to create a new unplaced wall.`);
                            setContextMenu(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-600 rounded"
                    >
                        <ClipboardCopyIcon className="w-4 h-4" />
                        Copy '{contextMenu.wall.name}' Details
                    </button>
                </div>
            )}
            <header className="flex-shrink-0 bg-slate-900/50 p-2 flex justify-between items-center z-30 border-b border-slate-700">
                 <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">PDF Plan Viewer</h3>
                    <div className="flex items-center gap-2">
                        <button onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={!pdfDoc || currentPage <= 1} className="px-2 py-1 bg-slate-700 rounded disabled:opacity-50">Prev</button>
                        <span className="tabular-nums">{currentPage} / {pdfDoc?.numPages || '...'}</span>
                        <button onClick={() => onPageChange(Math.min(pdfDoc?.numPages || 1, currentPage + 1))} disabled={!pdfDoc || currentPage >= (pdfDoc?.numPages || 1)} className="px-2 py-1 bg-slate-700 rounded disabled:opacity-50">Next</button>
                        <button onClick={() => setIsPageSelectorOpen(true)} disabled={!pdfDoc || pdfDoc.numPages <= 1} className="px-3 py-1 bg-slate-700 rounded disabled:opacity-50 text-sm">Select Page</button>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-indigo-900/40 px-3 py-1 rounded-full border border-indigo-500/30 text-xs shadow-inner">
                        <RulerIcon className="w-3.5 h-3.5 text-indigo-400"/>
                        <span className="text-slate-400 font-medium">Scale:</span>
                        <span className="font-mono font-bold text-indigo-200">
                            {scaleRatio ? `1 unit = ${scaleRatio.toFixed(3)}"` : 'Not Set'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        {onDetach && (
                             <button onClick={onDetach} className="p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white" title={isDetached ? "Attach to Main Window" : "Pop Out to New Window"}>
                                <ExternalLinkIcon className="w-5 h-5" />
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700"><CloseIcon className="w-5 h-5" /></button>
                    </div>
                </div>
            </header>
            <div className="flex-grow overflow-auto relative" ref={scrollContainerRef}>
                <div style={{ width: canvasRef.current?.width || '100%', height: canvasRef.current?.height || '100%', minHeight: '400px', position: 'relative', margin: 'auto' }}>
                    <canvas ref={canvasRef} className="absolute top-0 left-0" />
                    <canvas ref={overlayRef} className="absolute top-0 left-0 z-10" onClick={handleCanvasClick} onContextMenu={handleContextMenu} onMouseMove={handleMouseMove} />
                    {!pdfDoc && (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                            Loading PDF...
                        </div>
                    )}
                </div>
            </div>
            <div className="flex-shrink-0 bg-slate-900 p-3 border-t border-slate-700 z-20 space-y-2">
                <div className="bg-slate-800 p-2 rounded-md h-8 text-center text-sm text-indigo-300 flex items-center justify-center">
                     <span>{statusMessage}</span>
                </div>
                { mode === 'DRAWING_WALL' ? (
                     <div className="flex items-center gap-2">
                        <button onClick={handleFinishDrawing} className="w-full px-3 py-2 bg-slate-600 rounded-md hover:bg-slate-500 text-sm font-semibold">Stop Drawing (Esc)</button>
                    </div>
                ) : (
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <button onClick={handleSetScaleClick} className="flex items-center gap-2 px-3 py-2 bg-blue-600 rounded-md hover:bg-blue-700 text-sm">Set Scale</button>
                            <button onClick={handleDrawWallClick} disabled={!scaleRatio} className="flex items-center gap-2 px-3 py-2 bg-green-600 rounded-md hover:bg-green-700 text-sm disabled:bg-slate-600 disabled:cursor-not-allowed">Draw Wall(s)</button>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={showWallNames} onChange={e => setShowWallNames(e.target.checked)} className="h-4 w-4 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-600"/>
                                Show Names
                            </label>
                            <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600 font-bold">-</button>
                            <span className="w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
                            <button onClick={() => setZoom(z => z + 0.25)} className="px-2 py-1 bg-slate-700 rounded hover:bg-slate-600 font-bold">+</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PdfViewer;
