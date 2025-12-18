import React, { useState, useCallback, useEffect, useMemo } from 'react';
import type { Wall, Floor, FramingMaterials, WallDetails } from './types';
import WallEditor from './components/WallEditor';
import Project3DViewer from './components/Project3DViewer';
import LandingPage from './components/LandingPage';
import { calculateProjectMaterials } from './services/calculationService';
import { getProTip } from './services/geminiService';
import { generateMaterialListPdf } from './services/pdfService';
import { 
    signInWithGoogle, 
    signOut, 
    onAuthStateChanged, 
    getUserProfile, 
    createUserProfile, 
    getPendingUsers, 
    updateUserStatus,
    type User, 
    type UserProfile 
} from './services/auth';
import { ADMIN_EMAILS } from './config';
import { PlusIcon, TrashIcon, EditIcon, DuplicateIcon, ProjectIcon, DownloadIcon, CloseIcon, CubeIcon, LogoutIcon } from './components/Icons';

const generateId = () => `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const defaultWallDetails: WallDetails = {
    wallLength: 192,
    wallHeight: 97.125,
    studSize: '2x4',
    studSpacing: 16,
    studsOnCenter: 1,
    doubleTopPlate: true,
    pressureTreatedBottomPlate: false,
    blockingRows: 0,
    startStuds: 1,
    endStuds: 1,
    sheathing: false,
    sheathingType: '1/2" OSB',
    openings: [],
};

const formatLengthFeetInches = (totalInches: number) => {
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    const fraction = inches % 1;
    let fractionString = '';
    if (Math.abs(fraction - 0.125) < 0.01) fractionString = ' 1/8';
    else if (Math.abs(fraction - 0.25) < 0.01) fractionString = ' 1/4';
    else if (Math.abs(fraction - 0.375) < 0.01) fractionString = ' 3/8';
    else if (Math.abs(fraction - 0.5) < 0.01) fractionString = ' 1/2';
    else if (Math.abs(fraction - 0.625) < 0.01) fractionString = ' 5/8';
    else if (Math.abs(fraction - 0.75) < 0.01) fractionString = ' 3/4';
    else if (Math.abs(fraction - 0.875) < 0.01) fractionString = ' 7/8';

    const wholeInches = Math.floor(inches);
    if (wholeInches === 0 && fractionString === '') return `${feet}'`;
    return `${feet}' ${wholeInches}${fractionString}"`;
};

const formatHeight = (inches: number) => {
    if (Math.abs(inches - 97.125) < 0.01) return "8' 1 1/8\"";
    if (Math.abs(inches - 109.125) < 0.01) return "9' 1 1/8\"";
    return formatLengthFeetInches(inches);
};

interface WallRowProps {
    wall: Wall;
    selectedIds: Set<string>;
    isClicked: boolean;
    onToggleSelection: (id: string, shiftKey: boolean, ctrlKey: boolean) => void;
    onEdit: (wall: Wall) => void;
    onDelete: (id: string) => void;
    onDuplicate: (wall: Wall) => void;
}

const WallRow: React.FC<WallRowProps> = ({ wall, selectedIds, isClicked, onToggleSelection, onEdit, onDelete, onDuplicate }) => {
    const isSelected = selectedIds.has(wall.id);
    return (
        <tr 
            className={`transition-colors border-b border-slate-700/50 cursor-pointer select-none ${isClicked ? 'bg-cyan-900/30' : isSelected ? 'bg-indigo-900/20' : 'hover:bg-slate-700/50'}`} 
            onClick={(e) => onToggleSelection(wall.id, e.shiftKey, e.ctrlKey || e.metaKey)}
        >
            <td className="p-3 w-10 text-center" onClick={e => e.stopPropagation()}>
                <input 
                    type="checkbox" 
                    checked={isSelected} 
                    className="h-4 w-4 rounded bg-slate-700 border-slate-600 text-indigo-500" 
                    onChange={() => {}}
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        onToggleSelection(wall.id, e.shiftKey, e.ctrlKey || e.metaKey); 
                    }}
                />
            </td>
            <td className="p-3 text-slate-200 font-medium">{wall.name}</td>
            <td className="p-3 text-slate-300 font-mono text-sm">{formatLengthFeetInches(wall.details.wallLength)}</td>
            <td className="p-3 text-slate-300 font-mono text-sm">{formatHeight(wall.details.wallHeight)}</td>
            <td className="p-3">
                <div className="flex items-center gap-1 justify-end">
                    <button onClick={e => { e.stopPropagation(); onDuplicate(wall); }} className="p-1.5 text-slate-400 hover:text-indigo-400" title="Duplicate"><DuplicateIcon className="w-4 h-4"/></button>
                    <button onClick={e => { e.stopPropagation(); onEdit(wall); }} className="p-1.5 text-slate-400 hover:text-indigo-400" title="Edit"><EditIcon className="w-4 h-4"/></button>
                    <button onClick={e => { e.stopPropagation(); onDelete(wall.id); }} className="p-1.5 text-slate-400 hover:text-red-400" title="Delete"><TrashIcon className="w-4 h-4"/></button>
                </div>
            </td>
        </tr>
    );
};

const App: React.FC = () => {
    const [walls, setWalls] = useState<Wall[]>([]);
    const [selectedWall, setSelectedWall] = useState<Wall | null>(null);
    const [materials, setMaterials] = useState<FramingMaterials | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [selectedWallIds, setSelectedWallIds] = useState<Set<string>>(new Set());
    const [anchorWallId, setAnchorWallId] = useState<string | null>(null);
    const [clickedWallId, setClickedWallId] = useState<string | null>(null);
    const [isAddWallModalOpen, setIsAddWallModalOpen] = useState(false);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [is3dViewOpen, setIs3dViewOpen] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(async (u) => {
            setUser(u);
            if (u) {
                let profile = await getUserProfile(u.uid);
                if (!profile) profile = await createUserProfile(u);
                setUserProfile(profile);
            } else {
                setUserProfile(null);
            }
        });
        return () => unsubscribe();
    }, []);

    const visibleWallIds = useMemo(() => walls.map(w => w.id), [walls]);

    const handleToggleSelection = useCallback((wallId: string, shiftKey: boolean, ctrlKey: boolean) => {
        setClickedWallId(wallId);
        setSelectedWallIds(prev => {
            const next = new Set(prev);
            if (shiftKey && anchorWallId) {
                const startIdx = visibleWallIds.indexOf(anchorWallId);
                const endIdx = visibleWallIds.indexOf(wallId);
                if (startIdx !== -1 && endIdx !== -1) {
                    const [low, high] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
                    const rangeIds = visibleWallIds.slice(low, high + 1);
                    const baseSet = ctrlKey ? next : new Set<string>();
                    rangeIds.forEach(id => baseSet.add(id));
                    return baseSet;
                }
            }
            if (ctrlKey) {
                if (next.has(wallId)) next.delete(wallId);
                else next.add(wallId);
            } else {
                next.clear();
                next.add(wallId);
            }
            return next;
        });
        if (!shiftKey) setAnchorWallId(wallId);
    }, [visibleWallIds, anchorWallId]);

    const handleCalculate = async () => {
        if (walls.length === 0) return;
        setIsLoading(true);
        try {
            const { list, byWall, byFloor } = calculateProjectMaterials(walls, []);
            const proTip = await getProTip(walls);
            setMaterials({ 
                list, byWall, byFloor, proTip, 
                totalWalls: walls.length, 
                totalLinearFeet: walls.reduce((a, w) => a + w.details.wallLength, 0) / 12 
            });
        } catch (e) {
            console.error("Calculation Error:", e);
        } finally {
            setIsLoading(false);
        }
    };

    if (!user) return <LandingPage onLogin={signInWithGoogle} />;
    
    if (userProfile?.status === 'pending') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-8">
                <div className="text-center p-10 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl max-w-md">
                    <h2 className="text-2xl font-bold mb-4 text-indigo-400">Approval Pending</h2>
                    <p className="text-slate-400 mb-8">Your account is waiting for administrator approval. Guest accounts are auto-approved.</p>
                    <button onClick={() => signOut()} className="w-full py-3 bg-slate-700 rounded-lg font-semibold transition hover:bg-slate-600">Sign Out</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col text-white">
            <Project3DViewer isOpen={is3dViewOpen} walls={walls} assemblyWall={null} onClose={() => setIs3dViewOpen(false)} />
            <header className="bg-slate-800/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-700/50 p-4">
                <div className="container mx-auto flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-indigo-400 flex items-center gap-2"><ProjectIcon className="w-8 h-8"/>Framing Pro</h1>
                    <div className="flex gap-2">
                        {ADMIN_EMAILS.includes(user.email || '') && (
                            <button onClick={() => setIsAdminModalOpen(true)} className="bg-amber-600 px-4 py-2 rounded-lg text-sm font-semibold transition hover:bg-amber-500">Admin</button>
                        )}
                        <button onClick={() => setIs3dViewOpen(true)} className="bg-indigo-600 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition hover:bg-indigo-500"><CubeIcon className="w-4 h-4"/> 3D View</button>
                        <button onClick={() => signOut()} className="bg-slate-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition hover:bg-slate-600"><LogoutIcon className="w-4 h-4"/> Sign Out</button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8 flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <h2 className="text-2xl font-semibold text-white">Project Walls</h2>
                            {selectedWallIds.size > 0 && (
                                <button onClick={() => { setSelectedWallIds(new Set()); setAnchorWallId(null); }} className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20 transition hover:bg-indigo-500/20">Deselect All ({selectedWallIds.size})</button>
                            )}
                        </div>
                        <button onClick={() => setIsAddWallModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition shadow-lg shadow-indigo-900/20"><PlusIcon className="w-5 h-5"/> Add Wall</button>
                    </div>
                    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-2xl">
                        <table className="w-full text-left">
                            <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-700">
                                <tr><th className="p-3 w-10"></th><th className="p-3">Name</th><th className="p-3">Length</th><th className="p-3">Height</th><th className="p-3 text-right">Actions</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                                {walls.map(w => (
                                    <WallRow 
                                        key={w.id} 
                                        wall={w} 
                                        selectedIds={selectedWallIds} 
                                        isClicked={clickedWallId === w.id} 
                                        onToggleSelection={handleToggleSelection} 
                                        onEdit={setSelectedWall}
                                        onDelete={id => setWalls(walls.filter(x => x.id !== id))} 
                                        onDuplicate={wallToDup => setWalls([...walls, { ...JSON.parse(JSON.stringify(wallToDup)), id: generateId(), name: `${wallToDup.name} (Copy)` }])}
                                    />
                                ))}
                            </tbody>
                        </table>
                        {walls.length === 0 && <div className="p-16 text-center text-slate-500 italic">No walls added yet. Click "Add Wall" to begin.</div>}
                    </div>
                </div>

                <div className="lg:col-span-1">
                    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 sticky top-24 shadow-2xl space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white">Estimate</h2>
                            {materials && (
                                <button onClick={() => generateMaterialListPdf(walls, materials, 'consolidated')} className="text-indigo-400 hover:text-indigo-300 p-1 transition-colors" title="Export PDF"><DownloadIcon className="w-5 h-5"/></button>
                            )}
                        </div>
                        <button onClick={handleCalculate} disabled={isLoading || walls.length === 0} className="w-full bg-green-600 hover:bg-green-700 py-4 rounded-xl font-bold transition disabled:opacity-50 flex items-center justify-center gap-2">
                            {isLoading ? "Calculating..." : "Generate Material List"}
                        </button>
                        {materials && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar space-y-4">
                                    <table className="w-full text-sm">
                                        <thead className="border-b border-slate-700 text-slate-500 text-xs uppercase"><tr className="text-left"><th>Qty</th><th className="pl-2">Item</th><th className="text-right">Size</th></tr></thead>
                                        <tbody className="divide-y divide-slate-700/50">
                                            {materials.list.map((m, i) => (
                                                <tr key={i} className="group">
                                                    <td className="py-2.5 font-bold text-indigo-300 transition-colors group-hover:text-indigo-200">{m.quantity}</td>
                                                    <td className="py-2.5 pl-2 text-slate-300 transition-colors group-hover:text-slate-100">{m.description}</td>
                                                    <td className="py-2.5 text-right text-slate-500 font-mono transition-colors group-hover:text-slate-300">
                                                        {typeof m.length === 'number' && m.length > 0 ? `${m.length / 12}'` : m.length || 'Sheet'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {materials.proTip && (
                                    <div className="p-4 bg-indigo-900/30 border border-indigo-500/30 rounded-xl text-sm text-indigo-200 italic leading-relaxed shadow-inner">
                                        <span className="font-bold text-indigo-400 block mb-1">Pro Tip</span>
                                        "{materials.proTip}"
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {selectedWall && (
                <div className="fixed inset-0 z-50 p-4 md:p-12 bg-black/90 backdrop-blur-sm overflow-y-auto flex items-start justify-center">
                    <div className="w-full max-w-6xl">
                        <WallEditor wall={selectedWall} onSave={w => { setWalls(walls.map(x => x.id === w.id ? w : x)); setSelectedWall(null); }} onCancel={() => setSelectedWall(null)} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;