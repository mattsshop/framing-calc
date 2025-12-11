
import React, { useState, useEffect, useMemo } from 'react';
import type { Wall, WallDetails, Opening } from '../types';
import { PlusIcon, TrashIcon, WindowIcon, DoorIcon } from './Icons';
import WallVisualization from './WallVisualization';

interface WallEditorProps {
    wall: Wall;
    onSave: (wall: Wall) => void;
    onCancel: () => void;
}

const generateId = () => `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const OpeningRow: React.FC<{
    opening: Opening;
    onUpdate: (id: string, newOpening: Opening) => void;
    onDelete: (id: string) => void;
}> = ({ opening, onUpdate, onDelete }) => {
    
    const handleChange = (field: keyof Opening, value: any) => {
        // If updating centerOffset, ensure quantity is 1 for simplicity in MVP
        // If quantity changed > 1, clear centerOffset
        let updates: Partial<Opening> = { [field]: value };
        
        if (field === 'quantity' && (value as number) > 1) {
            updates.centerOffset = undefined;
        }
        if (field === 'centerOffset' && value !== undefined && opening.quantity > 1) {
             updates.quantity = 1;
        }

        onUpdate(opening.id, { ...opening, ...updates });
    };

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-10 gap-3 items-center p-2 bg-slate-800 rounded-md">
            <select value={opening.type} onChange={e => handleChange('type', e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md p-2">
                <option value="window">Window</option>
                <option value="door">Door</option>
            </select>
            <input type="number" value={opening.quantity} onChange={e => handleChange('quantity', parseInt(e.target.value, 10) || 1)} className="bg-slate-900 border border-slate-700 rounded-md p-2" placeholder="Qty" />
            <input type="number" value={opening.width} onChange={e => handleChange('width', parseInt(e.target.value, 10) || 0)} className="bg-slate-900 border border-slate-700 rounded-md p-2" placeholder="Width (in)" />
            <input type="number" value={opening.height} onChange={e => handleChange('height', parseInt(e.target.value, 10) || 0)} className="bg-slate-900 border border-slate-700 rounded-md p-2" placeholder="Height (in)" />
            
             <input 
                type="number" 
                value={opening.centerOffset || ''} 
                onChange={e => handleChange('centerOffset', e.target.value ? parseFloat(e.target.value) : undefined)} 
                className="bg-slate-900 border border-slate-700 rounded-md p-2 disabled:opacity-50" 
                placeholder={opening.quantity > 1 ? "Auto" : "Center (in)"}
                disabled={opening.quantity > 1}
                title={opening.quantity > 1 ? "Manual positioning disabled for multiple copies" : "Distance from start of wall to center"}
            />
            
            <input 
                type="number" 
                value={opening.headerTopOffset || ''} 
                onChange={e => handleChange('headerTopOffset', e.target.value ? parseFloat(e.target.value) : undefined)} 
                className="bg-slate-900 border border-slate-700 rounded-md p-2" 
                placeholder="Drop (in)"
                title="Distance from top plate to header"
            />

            <select value={opening.headerSize} onChange={e => handleChange('headerSize', e.target.value)} className="bg-slate-900 border border-slate-700 rounded-md p-2">
                <option value="2x6">2x6</option>
                <option value="2x8">2x8</option>
                <option value="2x10">2x10</option>
                <option value="2x12">2x12</option>
            </select>
            <select value={opening.headerPly} onChange={e => handleChange('headerPly', parseInt(e.target.value, 10) as 2 | 3)} className="bg-slate-900 border border-slate-700 rounded-md p-2">
                <option value={2}>Double (2-ply)</option>
                <option value={3}>Triple (3-ply)</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
                <input type="number" value={opening.jackStudsPerSide} onChange={e => handleChange('jackStudsPerSide', parseInt(e.target.value, 10) || 0)} className="bg-slate-900 border border-slate-700 rounded-md p-2" placeholder="Jacks" />
                <input type="number" value={opening.kingStudsPerSide} onChange={e => handleChange('kingStudsPerSide', parseInt(e.target.value, 10) || 0)} className="bg-slate-900 border border-slate-700 rounded-md p-2" placeholder="Kings" />
            </div>
            <button onClick={() => onDelete(opening.id)} className="p-2 text-red-400 hover:text-white hover:bg-red-500 rounded-full justify-self-center"><TrashIcon className="w-5 h-5" /></button>
        </div>
    );
};

const WallEditor: React.FC<WallEditorProps> = ({ wall, onSave, onCancel }) => {
    const [localWall, setLocalWall] = useState(wall);
    const [customHeight, setCustomHeight] = useState('');

    useEffect(() => {
        // Round length to 2 decimal places for cleaner display
        const roundedDetails = {
            ...wall.details,
            wallLength: Math.round(wall.details.wallLength * 100) / 100
        };
        
        setLocalWall({ ...wall, details: roundedDetails });

        const h = wall.details.wallHeight;
        if (h !== 97.125 && h !== 109.125) {
             setCustomHeight(h.toString());
        } else {
             setCustomHeight('');
        }
    }, [wall]);

    const handleDetailChange = (field: keyof WallDetails, value: any) => {
        setLocalWall(prev => ({ ...prev, details: { ...prev.details, [field]: value } }));
    };

    const handleOpeningUpdate = (id: string, updatedOpening: Opening) => {
        const newOpenings = localWall.details.openings.map(op => op.id === id ? updatedOpening : op);
        handleDetailChange('openings', newOpenings);
    };

    const handleAddOpening = (type: 'window' | 'door') => {
        const newOpening: Opening = {
            id: generateId(),
            type: type,
            quantity: 1,
            width: type === 'window' ? 36 : 36, 
            height: type === 'window' ? 48 : 80, 
            headerSize: '2x8',
            headerPly: 2,
            kingStudsPerSide: 1,
            jackStudsPerSide: 1,
        };
        handleDetailChange('openings', [...localWall.details.openings, newOpening]);
    };
    
    const handleDeleteOpening = (id: string) => {
        handleDetailChange('openings', localWall.details.openings.filter(op => op.id !== id));
    };

    return (
        <div className="bg-slate-900 rounded-xl shadow-2xl border border-slate-700 flex flex-col h-full max-h-[85vh] overflow-hidden">
             <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <div>
                     <label className="text-xs text-slate-400 font-bold uppercase tracking-wider block mb-1">Wall Name</label>
                    <input 
                        type="text" 
                        value={localWall.name} 
                        onChange={e => setLocalWall(prev => ({...prev, name: e.target.value}))}
                        className="bg-transparent text-2xl font-bold text-white border-none focus:ring-0 p-0 w-full placeholder-slate-600"
                        placeholder="Wall Name"
                    />
                </div>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="px-6 py-2 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition">Cancel</button>
                    <button onClick={() => onSave(localWall)} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition shadow-lg shadow-indigo-500/20">Save Changes</button>
                </div>
            </div>
            
            <div className="flex-grow overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Basic Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <label className="block text-sm font-medium text-slate-400 mb-2">Wall Length (inches)</label>
                        <input 
                            type="number" 
                            step="0.01"
                            value={localWall.details.wallLength} 
                            onChange={e => handleDetailChange('wallLength', parseFloat(e.target.value) || 0)} 
                            onBlur={() => handleDetailChange('wallLength', Math.round(localWall.details.wallLength * 100) / 100)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition" 
                        />
                         <p className="text-xs text-slate-500 mt-1">{(localWall.details.wallLength / 12).toFixed(2)} feet</p>
                    </div>
                     <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <label className="block text-sm font-medium text-slate-400 mb-2">Wall Height (inches)</label>
                        <div className="flex gap-2">
                             <select 
                                value={(localWall.details.wallHeight === 97.125 || localWall.details.wallHeight === 109.125) && !customHeight ? localWall.details.wallHeight : 'custom'} 
                                onChange={e => {
                                    const val = e.target.value;
                                    if (val === 'custom') {
                                        setCustomHeight(localWall.details.wallHeight.toString());
                                    } else {
                                        const numVal = parseFloat(val);
                                        handleDetailChange('wallHeight', numVal);
                                        setCustomHeight('');
                                    }
                                }} 
                                className="w-full bg-slate-900 border border-slate-700 rounded-md p-2"
                            >
                                <option value="97.125">8' 1 1/8"</option>
                                <option value="109.125">9' 1 1/8"</option>
                                <option value="custom">Custom</option>
                            </select>
                             {(customHeight !== '' || (localWall.details.wallHeight !== 97.125 && localWall.details.wallHeight !== 109.125)) && (
                                <input 
                                    type="number" 
                                    value={customHeight} 
                                    onChange={e => {
                                        setCustomHeight(e.target.value);
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val)) {
                                            handleDetailChange('wallHeight', val);
                                        }
                                    }}
                                    className="w-24 bg-slate-900 border border-slate-700 rounded-md p-2" 
                                />
                             )}
                        </div>
                    </div>
                     <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <label className="block text-sm font-medium text-slate-400 mb-2">Stud Size</label>
                        <select value={localWall.details.studSize} onChange={e => handleDetailChange('studSize', e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2">
                            <option value="2x4">2x4</option>
                            <option value="2x6">2x6</option>
                        </select>
                    </div>
                    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <label className="block text-sm font-medium text-slate-400 mb-2">Stud Spacing</label>
                        <select value={localWall.details.studSpacing} onChange={e => handleDetailChange('studSpacing', parseInt(e.target.value, 10))} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2">
                            <option value="8">8" O.C.</option>
                            <option value="12">12" O.C.</option>
                            <option value="16">16" O.C.</option>
                            <option value="24">24" O.C.</option>
                        </select>
                    </div>
                </div>

                {/* Advanced Options */}
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700 flex flex-col gap-2">
                         <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={localWall.details.doubleTopPlate} onChange={e => handleDetailChange('doubleTopPlate', e.target.checked)} className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-600"/>
                            <span className="text-slate-300">Double Top Plate</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={localWall.details.pressureTreatedBottomPlate} onChange={e => handleDetailChange('pressureTreatedBottomPlate', e.target.checked)} className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-600"/>
                            <span className="text-slate-300">PT Bottom Plate</span>
                        </label>
                         <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={localWall.details.sheathing} onChange={e => handleDetailChange('sheathing', e.target.checked)} className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-600"/>
                            <span className="text-slate-300">Add Sheathing</span>
                        </label>
                    </div>
                     <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <label className="block text-sm font-medium text-slate-400 mb-2">Studs On Center (Ply)</label>
                        <select value={localWall.details.studsOnCenter} onChange={e => handleDetailChange('studsOnCenter', parseInt(e.target.value, 10))} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2">
                            <option value="1">1 (Standard)</option>
                            <option value="2">2 (Double)</option>
                            <option value="3">3 (Triple)</option>
                            <option value="4">4 (Quad)</option>
                        </select>
                    </div>
                     <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <label className="block text-sm font-medium text-slate-400 mb-2">Blocking Rows</label>
                         <select value={localWall.details.blockingRows || 0} onChange={e => handleDetailChange('blockingRows', parseInt(e.target.value, 10))} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2">
                            <option value="0">None</option>
                            <option value="1">1 Row</option>
                            <option value="2">2 Rows</option>
                            <option value="3">3 Rows</option>
                        </select>
                    </div>
                     <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                         <label className="block text-sm font-medium text-slate-400 mb-2">Sheathing Type</label>
                         <select value={localWall.details.sheathingType || '1/2" OSB'} onChange={e => handleDetailChange('sheathingType', e.target.value)} disabled={!localWall.details.sheathing} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 disabled:opacity-50">
                             <option value='1/2" OSB'>1/2" OSB</option>
                             <option value='1/2" CDX Plywood'>1/2" CDX Plywood</option>
                             <option value='5/8" Zip System'>5/8" Zip System</option>
                         </select>
                     </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <label className="block text-sm font-medium text-slate-400 mb-2">Corners/Ends</label>
                         <div className="flex gap-2">
                            <div className="w-1/2">
                                <label className="text-xs text-slate-500">Start Studs</label>
                                <input type="number" value={localWall.details.startStuds || 1} onChange={e => handleDetailChange('startStuds', parseInt(e.target.value)||1)} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 mt-1"/>
                            </div>
                            <div className="w-1/2">
                                <label className="text-xs text-slate-500">End Studs</label>
                                <input type="number" value={localWall.details.endStuds || 1} onChange={e => handleDetailChange('endStuds', parseInt(e.target.value)||1)} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 mt-1"/>
                            </div>
                         </div>
                    </div>
                 </div>

                {/* Openings Section */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold">Openings</h3>
                        <div className="flex gap-2">
                            <button onClick={() => handleAddOpening('window')} className="flex items-center gap-2 px-3 py-1.5 bg-sky-600/20 text-sky-400 hover:bg-sky-600/30 border border-sky-600/50 rounded-lg transition text-sm font-semibold">
                                <WindowIcon className="w-5 h-5"/> Add Window
                            </button>
                            <button onClick={() => handleAddOpening('door')} className="flex items-center gap-2 px-3 py-1.5 bg-orange-600/20 text-orange-400 hover:bg-orange-600/30 border border-orange-600/50 rounded-lg transition text-sm font-semibold">
                                <DoorIcon className="w-5 h-5"/> Add Door
                            </button>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {localWall.details.openings.length === 0 ? (
                            <div className="text-center py-8 bg-slate-800 rounded-lg border-2 border-dashed border-slate-700 text-slate-500">
                                No openings in this wall. Add a window or door to get started.
                            </div>
                        ) : (
                            <>
                                <div className="hidden lg:grid grid-cols-10 gap-3 px-2 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    <div>Type</div>
                                    <div>Qty</div>
                                    <div>Width</div>
                                    <div>Height</div>
                                    <div>Center</div>
                                    <div>Drop</div>
                                    <div>Header Size</div>
                                    <div>Ply</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>Jacks</div>
                                        <div>Kings</div>
                                    </div>
                                    <div className="text-center">Action</div>
                                </div>
                                {localWall.details.openings.map(opening => (
                                    <OpeningRow 
                                        key={opening.id} 
                                        opening={opening} 
                                        onUpdate={handleOpeningUpdate} 
                                        onDelete={handleDeleteOpening} 
                                    />
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {/* Visualization */}
                <div>
                    <h3 className="text-xl font-semibold mb-4">Wall Preview</h3>
                    <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg overflow-x-auto">
                        <WallVisualization details={localWall.details} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WallEditor;