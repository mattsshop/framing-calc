
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Wall, Floor, FramingMaterials, WallDetails, Point, StudSize, HeaderSize } from './types';
import WallEditor from './components/WallEditor';
import PdfViewer from './components/PdfViewer';
import Project3DViewer from './components/Project3DViewer';
import PopOutWindow from './components/PopOutWindow';
import LandingPage from './components/LandingPage';
import { calculateProjectMaterials } from './services/calculationService';
import { getProTip } from './services/geminiService';
import { generateMaterialListPdf, generateMaterialReportPdf, drawWallOnCanvas } from './services/pdfService';
import { generateSketchUpScript } from './services/sketchupService';
import { generatePlyModel } from './services/exportService';
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
import { PlusIcon, TrashIcon, EditIcon, DuplicateIcon, ProjectIcon, DownloadIcon, PdfIcon, CloseIcon, CubeIcon, MapPinIcon, DocumentReportIcon, AssemblyViewIcon, SketchupIcon, SaveIcon, LoadIcon, ChevronDownIcon, ChevronRightIcon, ArrowRightIcon, ArrowLeftIcon, GripVerticalIcon, SparklesIcon, FolderIcon, ClipboardCopyIcon, ClipboardPasteIcon, GoogleIcon, LogoutIcon, RulerIcon } from './components/Icons';

const generateId = () => `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

interface LoadedProjectData {
    walls: Wall[];
    floors?: Floor[];
    pdfScales?: Record<number, number>;
    pdfData?: { name: string; dataUrl: string };
    pdfsData?: Record<string, { name: string; dataUrl: string }>;
}

const defaultWallDetails: WallDetails = {
    wallLength: 192, // 16 ft
    wallHeight: 97.125, // 8' 1 1/8"
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
    // Show 1/8th inch precision
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

// --- Components ---

const AdminUserModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
}> = ({ isOpen, onClose }) => {
    const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadPendingUsers();
        }
    }, [isOpen]);

    const loadPendingUsers = async () => {
        setLoading(true);
        const users = await getPendingUsers();
        setPendingUsers(users);
        setLoading(false);
    };

    const handleAction = async (uid: string, status: 'approved' | 'rejected') => {
        await updateUserStatus(uid, status);
        await loadPendingUsers();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-800 rounded-lg shadow-2xl p-6 w-full max-w-2xl m-4 border border-slate-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">Pending Approvals</h2>
                    <button onClick={onClose}><CloseIcon className="w-5 h-5 text-slate-400 hover:text-white"/></button>
                </div>
                
                {loading ? (
                    <div className="text-center py-8 text-slate-400">Loading pending users...</div>
                ) : pendingUsers.length === 0 ? (
                    <div className="text-center py-8 bg-slate-900/50 rounded-lg border border-slate-700 border-dashed text-slate-400">
                        No pending users found.
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                        {pendingUsers.map(user => (
                            <div key={user.uid} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-700/50 rounded-lg border border-slate-600 gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-600 overflow-hidden">
                                        {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold">{user.displayName?.[0]}</div>}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-white">{user.displayName}</div>
                                        <div className="text-sm text-slate-400">{user.email}</div>
                                    </div>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button 
                                        onClick={() => handleAction(user.uid, 'approved')}
                                        className="flex-1 sm:flex-none px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition"
                                    >
                                        Approve
                                    </button>
                                    <button 
                                        onClick={() => handleAction(user.uid, 'rejected')}
                                        className="flex-1 sm:flex-none px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition"
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const PendingApprovalScreen: React.FC<{ onSignOut: () => void }> = ({ onSignOut }) => (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 text-center">
            <div className="w-16 h-16 bg-yellow-500/20 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Approval Pending</h2>
            <p className="text-slate-400 mb-8">
                Your account has been created and is waiting for administrator approval. You will gain access once an admin approves your request.
            </p>
            <button 
                onClick={onSignOut}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition"
            >
                Sign Out
            </button>
        </div>
    </div>
);

const RejectedScreen: React.FC<{ onSignOut: () => void }> = ({ onSignOut }) => (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 text-center">
            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CloseIcon className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
            <p className="text-slate-400 mb-8">
                Your account request has been declined by an administrator. Please contact support if you believe this is an error.
            </p>
            <button 
                onClick={onSignOut}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition"
            >
                Sign Out
            </button>
        </div>
    </div>
);

const AddWallModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onCreate: (data: { name: string, length: number, height: number, doubleTopPlate: boolean, pressureTreatedBottomPlate: boolean }) => void;
    defaultName: string;
}> = ({ isOpen, onClose, onCreate, defaultName }) => {
    const [name, setName] = useState(defaultName);
    const [lengthFt, setLengthFt] = useState('16');
    const [lengthIn, setLengthIn] = useState('0');
    const [height, setHeight] = useState(97.125);
    const [doubleTop, setDoubleTop] = useState(true);
    const [ptBottom, setPtBottom] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setName(defaultName);
            setLengthFt('16'); setLengthIn('0'); setHeight(97.125);
            setDoubleTop(true); setPtBottom(false);
        }
    }, [isOpen, defaultName]);

    if (!isOpen) return null;

    const handleSubmit = () => {
        const totalLengthInches = (parseInt(lengthFt, 10) || 0) * 12 + (parseFloat(lengthIn) || 0);
        if (totalLengthInches > 0 && name.trim()) {
            onCreate({ name, length: totalLengthInches, height, doubleTopPlate: doubleTop, pressureTreatedBottomPlate: ptBottom });
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-800 rounded-lg shadow-2xl p-6 w-full max-w-md m-4 border border-slate-700" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-6">Add New Wall</h2>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-slate-400 block mb-1">Wall Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-400 block mb-1">Wall Length</label>
                        <div className="flex gap-2">
                            <input type="number" value={lengthFt} onChange={e => setLengthFt(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2" placeholder="ft" />
                            <input type="number" value={lengthIn} onChange={e => setLengthIn(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2" placeholder="in" />
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-400 block mb-1">Wall Height</label>
                        <select value={height} onChange={e => setHeight(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 rounded-md p-2">
                            <option value="97.125">8' 1 1/8" (92 5/8" studs)</option>
                            <option value="109.125">9' 1 1/8" (104 5/8" studs)</option>
                        </select>
                    </div>
                    <div className="pt-2 space-y-3">
                         <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={doubleTop} onChange={e => setDoubleTop(e.target.checked)} className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-600"/>
                            <span className="text-slate-300">Double Top Plate</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer">
                           <input type="checkbox" checked={ptBottom} onChange={e => setPtBottom(e.target.checked)} className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-600"/>
                            <span className="text-slate-300">Pressure-Treated Bottom Plate</span>
                        </label>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg hover:bg-slate-500 transition">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition">Create Wall</button>
                </div>
            </div>
        </div>
    );
};

// ... (Rest of existing data helper functions: dataURLtoFile, fileToDataUrl)
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) throw new Error('Invalid data URL format');
    const mime = mimeMatch[1];
    const bstr = atob(arr[arr.length - 1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
};

const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};

const PdfOptionsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (format: 'both' | 'breakdown' | 'consolidated' | 'by-floor') => void;
}> = ({ isOpen, onClose, onGenerate }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-800 rounded-lg shadow-2xl p-6 w-full max-w-sm m-4 border border-slate-700" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-6">PDF Download Options</h2>
                <p className="text-slate-400 mb-4">Choose the format for your material list:</p>
                <div className="space-y-3">
                    <button onClick={() => onGenerate('consolidated')} className="w-full text-left p-3 bg-slate-700 hover:bg-indigo-600 rounded-lg transition">
                        <h3 className="font-semibold">Consolidated List Only</h3>
                        <p className="text-sm text-slate-400">A single, combined list of all materials for the project.</p>
                    </button>
                    <button onClick={() => onGenerate('by-floor')} className="w-full text-left p-3 bg-slate-700 hover:bg-indigo-600 rounded-lg transition">
                        <h3 className="font-semibold">By Floor List</h3>
                        <p className="text-sm text-slate-400">Material lists aggregated by floor.</p>
                    </button>
                    <button onClick={() => onGenerate('breakdown')} className="w-full text-left p-3 bg-slate-700 hover:bg-indigo-600 rounded-lg transition">
                        <h3 className="font-semibold">Breakdown by Wall Only</h3>
                        <p className="text-sm text-slate-400">A separate material list for each individual wall.</p>
                    </button>
                    <button onClick={() => onGenerate('both')} className="w-full text-left p-3 bg-slate-700 hover:bg-indigo-600 rounded-lg transition">
                        <h3 className="font-semibold">Full Report</h3>
                        <p className="text-sm text-slate-400">Includes all lists and breakdowns.</p>
                    </button>
                </div>
                 <div className="flex justify-end mt-8">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg hover:bg-slate-500 transition">Cancel</button>
                </div>
            </div>
        </div>
    );
};

const FloorManagerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    floors: Floor[];
    activeFloorId: string;
    onAddFloor: (name: string, elevation: number, pdfPage?: number) => void;
    onUpdateFloor: (id: string, updates: Partial<Floor>) => void;
    onSetActiveFloor: (id: string) => void;
    onDeleteFloor: (id: string) => void;
    currentPage: number;
}> = ({ isOpen, onClose, floors, activeFloorId, onAddFloor, onUpdateFloor, onSetActiveFloor, onDeleteFloor, currentPage }) => {
    const [newFloorName, setNewFloorName] = useState('');
    const [newFloorElevation, setNewFloorElevation] = useState('0');
    const [newFloorPage, setNewFloorPage] = useState('');

    if (!isOpen) return null;

    const handleAdd = () => {
        if (newFloorName) {
            onAddFloor(newFloorName, parseFloat(newFloorElevation) || 0, newFloorPage ? parseInt(newFloorPage) : undefined);
            setNewFloorName('');
            setNewFloorElevation('');
            setNewFloorPage('');
        }
    };

    return (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-800 rounded-lg shadow-2xl p-6 w-full max-w-lg m-4 border border-slate-700" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Manage Floors</h2>
                    <button onClick={onClose}><CloseIcon className="w-5 h-5 hover:text-white text-slate-400"/></button>
                </div>
                
                <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                    {floors.map(floor => (
                        <div key={floor.id} className={`flex flex-col p-3 rounded border ${floor.id === activeFloorId ? 'bg-indigo-900/40 border-indigo-500' : 'bg-slate-700 border-slate-600'}`}>
                            <div className="flex justify-between items-center">
                                <div className="flex-1 mr-4">
                                    <input 
                                        type="text" 
                                        className="bg-transparent border-b border-transparent hover:border-slate-500 focus:border-indigo-500 font-semibold w-full outline-none"
                                        value={floor.name}
                                        onChange={(e) => onUpdateFloor(floor.id, { name: e.target.value })}
                                    />
                                    <div className="flex items-center gap-1 mt-1">
                                        <span className="text-xs text-slate-400">Elev:</span>
                                        <input 
                                            type="number"
                                            className="w-16 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-xs text-white"
                                            value={floor.elevation}
                                            onChange={(e) => onUpdateFloor(floor.id, { elevation: parseFloat(e.target.value) || 0 })}
                                        />
                                        <span className="text-xs text-slate-400">in</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-xs text-slate-400 flex flex-col items-end">
                                        <div className="flex items-center gap-1 mb-1">
                                            <span>PDF Page:</span>
                                            <button 
                                                onClick={() => onUpdateFloor(floor.id, { pdfPage: currentPage })}
                                                className="p-1 hover:bg-slate-600 rounded text-indigo-400"
                                                title="Use Current Page"
                                            >
                                                <MapPinIcon className="w-3 h-3" />
                                            </button>
                                        </div>
                                        <input 
                                            type="number" 
                                            className="w-12 bg-slate-900 border border-slate-600 rounded px-1 py-0.5 text-right text-white"
                                            value={floor.pdfPage || ''}
                                            placeholder="-"
                                            onChange={(e) => onUpdateFloor(floor.id, { pdfPage: parseInt(e.target.value) || undefined })}
                                        />
                                    </div>
                                    {floor.id !== activeFloorId && <button onClick={() => onSetActiveFloor(floor.id)} className="px-2 py-1 text-xs bg-slate-600 hover:bg-indigo-600 rounded">Select</button>}
                                    {floors.length > 1 && <button onClick={() => onDeleteFloor(floor.id)} className="p-1 text-red-400 hover:text-red-300"><TrashIcon className="w-4 h-4"/></button>}
                                </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-slate-600/50 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                    <RulerIcon className="w-3 h-3 text-indigo-400"/>
                                    <span>Scale:</span>
                                    <span className="font-mono text-indigo-300">
                                        {floor.scale ? `1 unit = ${floor.scale.toFixed(3)}"` : 'Not set'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="border-t border-slate-700 pt-4">
                    <h3 className="text-sm font-semibold mb-2 text-slate-400">Add New Floor</h3>
                    <div className="flex gap-2 mb-2">
                        <input type="text" placeholder="Floor Name (e.g. 2nd Floor)" value={newFloorName} onChange={e => setNewFloorName(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm" />
                        <input type="number" placeholder="Elev (in)" value={newFloorElevation} onChange={e => setNewFloorElevation(e.target.value)} className="w-20 bg-slate-900 border border-slate-700 rounded p-2 text-sm" />
                        <input type="number" placeholder="Page" value={newFloorPage} onChange={e => setNewFloorPage(e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded p-2 text-sm" />
                        <button 
                             onClick={() => setNewFloorPage(currentPage.toString())}
                             className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-indigo-400"
                             title="Use Current Page"
                        >
                            <MapPinIcon className="w-4 h-4" />
                        </button>
                    </div>
                    <button onClick={handleAdd} disabled={!newFloorName} className="w-full py-2 bg-green-600 hover:bg-green-700 rounded font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed">Add Floor</button>
                </div>
            </div>
        </div>
    );
};

const BulkEditPanel: React.FC<{
    selectedCount: number;
    floors: Floor[];
    onApply: (changes: { studSize?: StudSize; headerSize?: HeaderSize; headerPly?: 2 | 3; studsOnCenter?: 1 | 2 | 3 | 4; blockingRows?: number; sheathing?: boolean; floorId?: string }) => void;
    onClear: () => void;
    style?: React.CSSProperties;
    clipboardDetails: WallDetails | null;
    onPasteProperties: () => void;
}> = ({ selectedCount, floors, onApply, onClear, style, clipboardDetails, onPasteProperties }) => {
    const [studSize, setStudSize] = useState<StudSize | ''>('');
    const [headerSize, setHeaderSize] = useState<HeaderSize | ''>('');
    const [headerPly, setHeaderPly] = useState<number | ''>('');
    const [studsOnCenter, setStudsOnCenter] = useState<number | ''>('');
    const [blockingRows, setBlockingRows] = useState<number | ''>('');
    const [sheathing, setSheathing] = useState<string>('');
    const [floorId, setFloorId] = useState<string>('');

    const handleApply = () => {
        const changes: any = {};
        if (studSize) changes.studSize = studSize;
        if (headerSize) changes.headerSize = headerSize;
        if (headerPly) changes.headerPly = headerPly as 2 | 3;
        if (studsOnCenter) changes.studsOnCenter = studsOnCenter as 1 | 2 | 3 | 4;
        if (blockingRows !== '') changes.blockingRows = blockingRows as number;
        if (sheathing !== '') changes.sheathing = sheathing === 'yes';
        if (floorId) changes.floorId = floorId;

        if (Object.keys(changes).length > 0) {
            onApply(changes);
        }
    };
    
    useEffect(() => {
        if (selectedCount === 0) {
            setStudSize('');
            setHeaderSize('');
            setHeaderPly('');
            setStudsOnCenter('');
            setBlockingRows('');
            setSheathing('');
            setFloorId('');
        }
    }, [selectedCount]);

    return (
        <div 
            className="fixed bottom-0 -translate-x-1/2 w-full max-w-7xl z-40 p-4 transition-all duration-100 ease-out"
            style={{ left: '50%', ...style }}
        >
            <div className="bg-slate-700/80 backdrop-blur-lg rounded-xl shadow-2xl p-4 border border-slate-600 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <SparklesIcon className="w-6 h-6 text-indigo-400" />
                    <span className="font-bold text-lg">{selectedCount} walls selected</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 justify-center">
                    <div>
                        <label className="text-xs text-slate-400 block">Floor</label>
                        <select value={floorId} onChange={e => setFloorId(e.target.value)} className="bg-slate-800 border border-slate-600 rounded-md p-2 text-sm w-32">
                            <option value="">No Change</option>
                            {floors.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block">Stud Size</label>
                        <select value={studSize} onChange={e => setStudSize(e.target.value as StudSize | '')} className="bg-slate-800 border border-slate-600 rounded-md p-2 text-sm w-24">
                            <option value="">No Change</option>
                            <option value="2x4">2x4</option>
                            <option value="2x6">2x6</option>
                        </select>
                    </div>
                     <div>
                        <label className="text-xs text-slate-400 block">O.C. Count</label>
                        <select value={studsOnCenter} onChange={e => setStudsOnCenter(e.target.value ? parseInt(e.target.value, 10) : '')} className="bg-slate-800 border border-slate-600 rounded-md p-2 text-sm w-24">
                            <option value="">No Change</option>
                            <option value="1">Single</option>
                            <option value="2">Double</option>
                            <option value="3">Triple</option>
                            <option value="4">Quad</option>
                        </select>
                    </div>
                     <div>
                        <label className="text-xs text-slate-400 block">Blocking</label>
                        <select value={blockingRows} onChange={e => setBlockingRows(e.target.value ? parseInt(e.target.value, 10) : '')} className="bg-slate-800 border border-slate-600 rounded-md p-2 text-sm w-24">
                            <option value="">No Change</option>
                            <option value="0">None</option>
                            <option value="1">1 Row</option>
                            <option value="2">2 Rows</option>
                            <option value="3">3 Rows</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block">Sheathing</label>
                        <select value={sheathing} onChange={e => setSheathing(e.target.value)} className="bg-slate-800 border border-slate-600 rounded-md p-2 text-sm w-24">
                            <option value="">No Change</option>
                            <option value="yes">Add</option>
                            <option value="no">Remove</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block">Header Size</label>
                        <select value={headerSize} onChange={e => setHeaderSize(e.target.value as HeaderSize | '')} className="bg-slate-800 border border-slate-600 rounded-md p-2 text-sm w-24">
                             <option value="">No Change</option>
                             <option value="2x6">2x6</option>
                             <option value="2x8">2x8</option>
                             <option value="2x10">2x10</option>
                             <option value="2x12">2x12</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-400 block">Header Ply</label>
                        <select value={headerPly} onChange={e => setHeaderPly(e.target.value ? parseInt(e.target.value, 10) : '')} className="bg-slate-800 border border-slate-600 rounded-md p-2 text-sm w-24">
                            <option value="">No Change</option>
                            <option value="2">Double</option>
                            <option value="3">Triple</option>
                        </select>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {clipboardDetails && (
                         <button onClick={onPasteProperties} className="px-5 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition flex items-center gap-2" title="Paste Copied Properties to Selected Walls">
                            <ClipboardPasteIcon className="w-5 h-5"/> Paste Props
                        </button>
                    )}
                    <button onClick={handleApply} className="px-5 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition">Apply</button>
                    <button onClick={onClear} className="px-5 py-2 bg-slate-600 text-white font-semibold rounded-lg hover:bg-slate-500 transition">Cancel</button>
                </div>
            </div>
        </div>
    );
};

interface WallNode {
    wall: Wall;
    children: WallNode[];
    level: number;
}

const findDescendantIds = (parentId: string, allWalls: Wall[]): string[] => {
    const descendants: string[] = [];
    const findChildren = (pId: string) => {
        const children = allWalls.filter(w => w.parentId === pId);
        children.forEach(child => {
            descendants.push(child.id);
            findChildren(child.id);
        });
    };
    findChildren(parentId);
    return descendants;
};

interface WallRowProps {
    node: { wall: Wall; level: number };
    selectedIds: Set<string>;
    isClicked: boolean;
    floors: Floor[];
    walls: Wall[];
    collapsedParents: Record<string, boolean>;
    draggedId: string | null;
    dragOverState: { targetId: string; position: 'above' | 'on' | 'below' } | null;
    wallsByFloor: Record<string, { wall: Wall; level: number }[]>;
    hasActivePdf: boolean;
    getDescendantIds: (parentId: string) => string[];
    onToggleSelection: (id: string, shiftKey: boolean) => void;
    onWallClick: (id: string, e: React.MouseEvent) => void;
    onUpdateFloor: (wallId: string, floorId: string) => void;
    onCopyProperties: (wall: Wall) => void;
    toggleParent: (parentId: string) => void;
    handleIndentWall: (wallId: string) => void;
    handleOutdentWall: (wallId: string) => void;
    handleDragStart: (e: React.DragEvent, wallId: string) => void;
    handleDragOver: (e: React.DragEvent, wallId: string) => void;
    handleDragLeave: (wallId: string) => void;
    handleDrop: (e: React.DragEvent) => void;
    handleDragEnd: () => void;
    setHighlightedWallId: (id: string | null) => void;
    setWallToPlace: (wall: Wall) => void;
    setAssemblyWall: (wall: Wall) => void;
    handleDuplicateWall: (wall: Wall) => void;
    setSelectedWall: (wall: Wall) => void;
    handleDeleteWall: (id: string) => void;
}

const WallRow: React.FC<WallRowProps> = ({ 
    node, 
    selectedIds, 
    isClicked, 
    floors, 
    walls,
    collapsedParents,
    draggedId,
    dragOverState,
    wallsByFloor,
    hasActivePdf,
    getDescendantIds,
    onToggleSelection, 
    onWallClick, 
    onUpdateFloor, 
    onCopyProperties,
    toggleParent,
    handleIndentWall,
    handleOutdentWall,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleDragEnd,
    setHighlightedWallId,
    setWallToPlace,
    setAssemblyWall,
    handleDuplicateWall,
    setSelectedWall,
    handleDeleteWall
}) => {
    const { wall, level } = node;
    const descendants = useMemo(() => getDescendantIds(wall.id), [wall.id, getDescendantIds]);
    const children = walls.filter(w => w.parentId === wall.id);
    const isParent = children.length > 0;
    const isCollapsed = collapsedParents[wall.id];
    
    const isSelected = selectedIds.has(wall.id);
    const selectedDescendantsCount = useMemo(() => descendants.filter(id => selectedIds.has(id)).length, [descendants, selectedIds]);
    const isIndeterminate = !isSelected && isParent && selectedDescendantsCount > 0;

    const isBeingDragged = draggedId === wall.id || (selectedIds.has(wall.id) && selectedIds.has(draggedId || ''));
    const isDragTarget = dragOverState?.targetId === wall.id;
    
    const floorId = wall.floorId || floors[0].id;
    const flatList = wallsByFloor[floorId] || [];
    const flatIndex = flatList.findIndex(item => item.wall.id === wall.id);
    const canIndent = flatIndex > 0 && flatList[flatIndex - 1].level >= level;
    const canOutdent = !!wall.parentId;

    const rowRef = useRef<HTMLTableRowElement>(null);
    useEffect(() => {
        if (isClicked) {
            rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [isClicked]);

    const borderClass = isDragTarget ? (
        dragOverState.position === 'above' ? 'border-t-2 border-indigo-500' :
        dragOverState.position === 'below' ? 'border-b-2 border-indigo-500' :
        'ring-2 ring-indigo-500 ring-inset'
    ) : (
        isClicked ? 'bg-cyan-900/30' : 
        isSelected ? 'bg-indigo-900/30' : 
        'hover:bg-slate-700/50'
    );

    return (
        <tr
            ref={rowRef}
            draggable
            onDragStart={(e) => handleDragStart(e, wall.id)}
            onDragOver={(e) => handleDragOver(e, wall.id)}
            onDragLeave={() => handleDragLeave(wall.id)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            className={`transition-colors border-b border-slate-700/50 ${borderClass} ${isBeingDragged ? 'opacity-40' : ''} cursor-pointer`}
            onClick={(e) => onWallClick(wall.id, e)}
            onMouseEnter={() => setHighlightedWallId(wall.id)}
            onMouseLeave={() => setHighlightedWallId(null)}
        >
            <td className="p-3 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                <input
                    type="checkbox"
                    className="h-4 w-4 rounded bg-slate-700 border-slate-600 text-indigo-500 focus:ring-indigo-600 cursor-pointer"
                    checked={isSelected}
                    ref={el => { if (el) el.indeterminate = isIndeterminate; }}
                    onClick={(e) => {
                        // Crucial: Use onClick on the input itself to catch the shiftKey during toggle
                        e.stopPropagation();
                        onToggleSelection(wall.id, e.shiftKey);
                    }}
                    onChange={() => {}} // Stub to avoid read-only warning, logic is in onClick
                />
            </td>
            <td className="p-3">
                <div className="flex items-center" style={{ paddingLeft: `${level * 1.5}rem` }}>
                    <div className="drag-handle cursor-move text-slate-500 hover:text-slate-300 mr-2" onMouseDown={e => e.stopPropagation()}>
                        <GripVerticalIcon className="w-4 h-4" />
                    </div>
                    {isParent && (
                        <button onClick={(e) => { e.stopPropagation(); toggleParent(wall.id); }} className="p-1 rounded hover:bg-slate-600 mr-1">
                            {isCollapsed ? <ChevronRightIcon className="w-3 h-3 text-slate-400" /> : <ChevronDownIcon className="w-3 h-3 text-slate-400" />}
                        </button>
                    )}
                    {!isParent && <div className="w-5 mr-1" />}
                    <span className="font-medium text-slate-200">{wall.name}</span>
                    <div className="flex ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={(e) => { e.stopPropagation(); handleOutdentWall(wall.id); }} disabled={!canOutdent} className="p-1 text-slate-500 hover:text-white disabled:opacity-0"><ArrowLeftIcon className="w-3 h-3" /></button>
                         <button onClick={(e) => { e.stopPropagation(); handleIndentWall(wall.id); }} disabled={!canIndent} className="p-1 text-slate-500 hover:text-white disabled:opacity-0"><ArrowRightIcon className="w-3 h-3" /></button>
                    </div>
                </div>
            </td>
            <td className="p-3 text-slate-300 font-mono text-sm whitespace-nowrap">{formatLengthFeetInches(wall.details.wallLength)}</td>
            <td className="p-3 text-slate-300 font-mono text-sm whitespace-nowrap">{formatHeight(wall.details.wallHeight)}</td>
            <td className="p-3 text-slate-300 text-sm whitespace-nowrap">
                <span className="px-2 py-0.5 rounded bg-slate-700 border border-slate-600">{wall.details.studSize}</span>
                <span className="ml-1 text-slate-400">@{wall.details.studSpacing}"</span>
            </td>
             <td className="p-3 text-slate-300 text-sm whitespace-nowrap" onClick={e => e.stopPropagation()}>
                <select 
                    value={wall.floorId || floors[0].id} 
                    onChange={(e) => onUpdateFloor(wall.id, e.target.value)}
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 outline-none max-w-[100px]"
                >
                    {floors.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>
            </td>
            <td className="p-3 text-slate-400 text-xs">
               <div className="flex flex-col gap-1">
                    {wall.details.doubleTopPlate && <span className="text-yellow-500/80">Double Top</span>}
                    {wall.details.pressureTreatedBottomPlate && <span className="text-green-500/80">PT Bottom</span>}
                    {wall.details.blockingRows > 0 && <span className="text-orange-400/80">{wall.details.blockingRows} Row{wall.details.blockingRows > 1 ? 's' : ''} Block</span>}
                    {wall.details.sheathing && <span className="text-amber-300/80">Sheathed</span>}
               </div>
            </td>
            <td className="p-3 text-slate-300 text-sm">
                {wall.details.openings.length > 0 ? (
                    <div className="flex gap-2 text-xs">
                         {wall.details.openings.filter(o => o.type === 'window').length > 0 && 
                            <span className="bg-sky-900/50 text-sky-300 px-1.5 py-0.5 rounded">{wall.details.openings.filter(o => o.type === 'window').reduce((a,b)=>a+b.quantity,0)} Win</span>
                         }
                         {wall.details.openings.filter(o => o.type === 'door').length > 0 && 
                            <span className="bg-orange-900/50 text-orange-300 px-1.5 py-0.5 rounded">{wall.details.openings.filter(o => o.type === 'door').reduce((a,b)=>a+b.quantity,0)} Door</span>
                         }
                    </div>
                ) : <span className="text-slate-600">-</span>}
            </td>
            <td className="p-3">
                <div className="flex items-center gap-1">
                     {hasActivePdf && !wall.pdfPosition && (<button onClick={(e) => { e.stopPropagation(); setWallToPlace(wall);}} className="p-1.5 text-slate-400 hover:text-purple-400 rounded hover:bg-slate-700" title="Place on Plan"><MapPinIcon className="w-4 h-4"/></button>)}
                    <button onClick={(e) => { e.stopPropagation(); onCopyProperties(wall); }} className="p-1.5 text-slate-400 hover:text-blue-400 rounded hover:bg-slate-700" title="Copy Properties"><ClipboardCopyIcon className="w-4 h-4"/></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDuplicateWall(wall);}} className="p-1.5 text-slate-400 hover:text-indigo-400 rounded hover:bg-slate-700" title="Duplicate Wall"><DuplicateIcon className="w-4 h-4"/></button>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedWall(wall);}} className="p-1.5 text-slate-400 hover:text-indigo-400 rounded hover:bg-slate-700" title="Edit Wall"><EditIcon className="w-4 h-4"/></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteWall(wall.id);}} className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-red-900/30" title="Delete Wall"><TrashIcon className="w-4 h-4"/></button>
                </div>
            </td>
        </tr>
    );
};

// --- App Component ---

const App: React.FC = () => {
    const [walls, setWalls] = useState<Wall[]>([]);
    const [floors, setFloors] = useState<Floor[]>([{ id: 'floor-1', name: '1st Floor', elevation: 0 }]);
    const [activeFloorId, setActiveFloorId] = useState<string>('floor-1');
    const [pdfPageNum, setPdfPageNum] = useState(1);
    const [selectedWall, setSelectedWall] = useState<Wall | null>(null);
    const [materials, setMaterials] = useState<FramingMaterials | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Auth State
    const [user, setUser] = useState<User | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [isProfileLoading, setIsProfileLoading] = useState(false);
    
    // Admin State
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    
    // Updated: Store PDF file per floor
    const [floorPdfs, setFloorPdfs] = useState<Record<string, File>>({});
    
    const [is3dViewOpen, setIs3dViewOpen] = useState(false);
    const [assemblyWall, setAssemblyWall] = useState<Wall | null>(null);
    const [isAddWallModalOpen, setIsAddWallModalOpen] = useState(false);
    const [isFloorManagerOpen, setIsFloorManagerOpen] = useState(false);
    const [wallToPlace, setWallToPlace] = useState<Wall | null>(null);
    const [highlightedWallId, setHighlightedWallId] = useState<string | null>(null);
    const [clickedWallId, setClickedWallId] = useState<string | null>(null);
    const [wallToFocusId, setWallToFocusId] = useState<string | null>(null);
    const [materialViewMode, setMaterialViewMode] = useState<'total' | 'floor' | 'wall'>('total');
    const [copiedWallDetails, setCopiedWallDetails] = useState<Wall | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pdfPanelWidth, setPdfPanelWidth] = useState(Math.max(window.innerWidth * 0.4, 400));
    const [isPdfOptionsModalOpen, setIsPdfOptionsModalOpen] = useState(false);
    const [collapsedParents, setCollapsedParents] = useState<Record<string, boolean>>({});
    const [selectedWallIds, setSelectedWallIds] = useState<Set<string>>(new Set());
    const [lastInteractedWallId, setLastInteractedWallId] = useState<string | null>(null);
    
    // PDF Viewer specific states
    const [selectedPdfWallIds, setSelectedPdfWallIds] = useState<Set<string>>(new Set());
    const [copiedLayout, setCopiedLayout] = useState<{ walls: Wall[], anchor: Point } | null>(null);
    
    // Collapsed Floors state
    const [collapsedFloors, setCollapsedFloors] = useState<Record<string, boolean>>({});

    // Drag and Drop State
    const [draggedId, setDraggedId] = useState<string | null>(null);
    type DragPosition = 'above' | 'on' | 'below';
    const [dragOverState, setDragOverState] = useState<{ targetId: string; position: DragPosition } | null>(null);

    // Property Copy/Paste
    const [propertyClipboard, setPropertyClipboard] = useState<WallDetails | null>(null);
    
    // Pop Out Window State
    const [isPdfDetached, setIsPdfDetached] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                setIsProfileLoading(true);
                // 1. Get existing profile
                let profile = await getUserProfile(currentUser.uid);
                
                // 2. If no profile exists, create one (status: pending)
                if (!profile) {
                    profile = await createUserProfile(currentUser);
                }
                
                // 3. Set profile state
                setUserProfile(profile);
                setIsProfileLoading(false);
            } else {
                setUserProfile(null);
            }
            setIsAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const isAdmin = useMemo(() => {
        if (!user || !user.email) return false;
        return ADMIN_EMAILS.includes(user.email);
    }, [user]);

    const handleGoogleSignIn = async () => {
        try {
            await signInWithGoogle();
        } catch (error) {
            console.error(error);
            alert("Login Failed. See console for details.");
        }
    };

    const handleSignOut = async () => {
        await signOut();
    };

    const getDescendantIds = useCallback((parentId: string): string[] => findDescendantIds(parentId, walls), [walls]);
    
    const getAncestorIds = useCallback((childId: string): string[] => {
        const ancestors: string[] = [];
        let currentWall = walls.find(w => w.id === childId);
        while(currentWall && currentWall.parentId) {
            const pId = currentWall.parentId;
            ancestors.push(pId);
            const parent = walls.find(w => w.id === pId);
            if (parent) {
                currentWall = parent;
            } else {
                break;
            }
        }
        return ancestors;
    }, [walls]);

    // Prepare wall data grouped by floors for the "Roll up" view
    const wallsByFloor = useMemo(() => {
        const flatListsByFloor: Record<string, { wall: Wall; level: number }[]> = {};

        floors.forEach(floor => {
             // Get walls for this floor
             const floorWalls = walls.filter(w => w.floorId === floor.id || (!w.floorId && floor.id === floors[0].id));
             
             // Build tree for this floor specifically
             const floorWallMap = new Map<string, { wall: Wall; children: any[] }>();
             floorWalls.forEach(w => floorWallMap.set(w.id, { wall: w, children: [] }));
             
             const roots: any[] = [];
             floorWalls.forEach(w => {
                 const node = floorWallMap.get(w.id)!;
                 // Only treat as child if parent is ALSO on this floor
                 if (w.parentId && floorWallMap.has(w.parentId)) {
                     floorWallMap.get(w.parentId)!.children.push(node);
                 } else {
                     roots.push(node);
                 }
             });

             const flatList: { wall: Wall; level: number }[] = [];
             const traverse = (nodes: any[], level: number) => {
                 nodes.forEach(node => {
                     flatList.push({ wall: node.wall, level });
                     if (!collapsedParents[node.wall.id]) {
                         traverse(node.children, level + 1);
                     }
                 });
             };
             traverse(roots, 0);
             flatListsByFloor[floor.id] = flatList;
        });
        
        return flatListsByFloor;

    }, [walls, floors, collapsedParents]);

    // Get flat list of visible wall IDs for range selection
    const visibleWallIds = useMemo(() => {
        return floors.flatMap(f => {
            if (collapsedFloors[f.id]) return [];
            return (wallsByFloor[f.id] || []).map(item => item.wall.id);
        });
    }, [floors, collapsedFloors, wallsByFloor]);
    
    const handleToggleWallSelection = useCallback((wallId: string, shiftKey: boolean) => {
        setSelectedWallIds(prevSelected => {
            const newSelection = new Set(prevSelected);
            
            if (shiftKey && lastInteractedWallId) {
                const startIndex = visibleWallIds.indexOf(lastInteractedWallId);
                const endIndex = visibleWallIds.indexOf(wallId);
                
                if (startIndex !== -1 && endIndex !== -1) {
                    const start = Math.min(startIndex, endIndex);
                    const end = Math.max(startIndex, endIndex);
                    const rangeIds = visibleWallIds.slice(start, end + 1);
                    
                    // Determine new state based on current anchor item
                    // If you shift-click to a range, usually all items become the state of the first item you selected
                    const newState = !newSelection.has(wallId); // Simple toggle logic for range target

                    rangeIds.forEach(id => {
                        if (newState) newSelection.add(id);
                        else newSelection.delete(id);
                    });
                    return newSelection;
                }
            } 
            
            // Standard single toggle logic
            const isCurrentlySelected = newSelection.has(wallId);
            const descendantIds = getDescendantIds(wallId);
    
            if (isCurrentlySelected) {
                newSelection.delete(wallId);
                descendantIds.forEach(id => newSelection.delete(id));
                const ancestorIds = getAncestorIds(wallId);
                ancestorIds.forEach(id => newSelection.delete(id));
            } else {
                newSelection.add(wallId);
                descendantIds.forEach(id => newSelection.add(id));
            }
            
            return newSelection;
        });
        // Always update anchor point on interaction
        setLastInteractedWallId(wallId);
    }, [getDescendantIds, getAncestorIds, lastInteractedWallId, visibleWallIds]);

    const handleApplyBulkEdit = (changes: { studSize?: StudSize; headerSize?: HeaderSize; headerPly?: 2 | 3; studsOnCenter?: 1 | 2 | 3 | 4; blockingRows?: number; sheathing?: boolean; floorId?: string }) => {
        setWalls(prevWalls => 
            prevWalls.map(wall => {
                if (selectedWallIds.has(wall.id)) {
                    let updatedWall = { ...wall };
                    const newDetails = { ...wall.details };
                    
                    if (changes.studSize) newDetails.studSize = changes.studSize;
                    if (changes.studsOnCenter) newDetails.studsOnCenter = changes.studsOnCenter;
                    if (changes.blockingRows !== undefined) newDetails.blockingRows = changes.blockingRows;
                    if (changes.sheathing !== undefined) newDetails.sheathing = changes.sheathing;
                    if (changes.floorId) updatedWall.floorId = changes.floorId;

                    if (changes.headerSize || changes.headerPly) {
                        newDetails.openings = newDetails.openings.map(op => {
                           const newOp = { ...op };
                           if (changes.headerSize) newOp.headerSize = changes.headerSize;
                           if (changes.headerPly) newOp.headerPly = changes.headerPly;
                           return newOp;
                       });
                    }
                    return { ...updatedWall, details: newDetails };
                }
                return wall;
            })
        );
        setSelectedWallIds(new Set());
    };

    const handleCopyWallProperties = (wall: Wall) => {
        // We copy details but exclude things like length and openings which are specific to the instance
        const detailsToCopy = { ...wall.details };
        setPropertyClipboard(detailsToCopy);
    };

    const handlePastePropertiesToSelected = () => {
        if (!propertyClipboard || selectedWallIds.size === 0) return;

        setWalls(prevWalls => prevWalls.map(wall => {
            if (selectedWallIds.has(wall.id)) {
                return {
                    ...wall,
                    details: {
                        ...wall.details,
                        // Apply copied properties but preserve geometry/instance specific fields
                        wallHeight: propertyClipboard.wallHeight,
                        studSize: propertyClipboard.studSize,
                        studSpacing: propertyClipboard.studSpacing,
                        studsOnCenter: propertyClipboard.studsOnCenter,
                        doubleTopPlate: propertyClipboard.doubleTopPlate,
                        pressureTreatedBottomPlate: propertyClipboard.pressureTreatedBottomPlate,
                        blockingRows: propertyClipboard.blockingRows,
                        sheathing: propertyClipboard.sheathing,
                        sheathingType: propertyClipboard.sheathingType,
                        startStuds: propertyClipboard.startStuds,
                        endStuds: propertyClipboard.endStuds,
                        // Preserve original length and openings
                    }
                };
            }
            return wall;
        }));
        setSelectedWallIds(new Set());
    };

    const handleMouseDownOnResizer = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        const startWidth = pdfPanelWidth;
        const startPosition = e.clientX;

        const handleMouseMove = (e: MouseEvent) => {
            const dx = e.clientX - startPosition;
            const newWidth = startWidth + dx; // Resizing from the right edge now

            const minWidth = 300; 
            const maxWidth = window.innerWidth * 0.8;  
            
            if (newWidth > minWidth && newWidth < maxWidth) {
                setPdfPanelWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleCreateWall = (data: { name: string, length: number, height: number, doubleTopPlate: boolean, pressureTreatedBottomPlate: boolean }) => {
        const newWall: Wall = {
            id: generateId(),
            name: data.name, // Removed redundant stud size prefix
            floorId: activeFloorId,
            parentId: null,
            details: {
                ...JSON.parse(JSON.stringify(defaultWallDetails)),
                wallLength: data.length,
                wallHeight: data.height,
                doubleTopPlate: data.doubleTopPlate,
                pressureTreatedBottomPlate: data.pressureTreatedBottomPlate,
            }
        };
        setWalls(prev => [...prev, newWall]);
        setIsAddWallModalOpen(false);
    };

    const handleAddWallFromPdf = (name: string, lengthInInches: number, position: { start: Point; end: Point; pageNum: number; }) => {
        const newWall: Wall = {
            id: generateId(),
            name: name, // Removed redundant stud size prefix
            floorId: activeFloorId,
            parentId: null,
            details: {
                ...JSON.parse(JSON.stringify(defaultWallDetails)),
                wallLength: lengthInInches,
            },
            pdfPosition: position,
        };
        setWalls(prev => [...prev, newWall]);
    };

    const handleWallPlaced = (wallId: string, position: { start: Point; end: Point; pageNum: number; }, newLengthInches?: number) => {
        setWalls(prev => prev.map(w => {
            if (w.id === wallId) {
                const updatedWall = { ...w, pdfPosition: position };
                if (newLengthInches !== undefined && newLengthInches > 0) {
                    updatedWall.details = { ...updatedWall.details, wallLength: newLengthInches };
                }
                return updatedWall;
            }
            return w;
        }));
        setWallToPlace(null);
    };

    const handleSaveWall = (updatedWall: Wall) => {
        const originalWall = walls.find(w => w.id === updatedWall.id);
        let finalWall = updatedWall;

        if (originalWall?.pdfPosition && updatedWall.pdfPosition && originalWall.details.wallLength !== updatedWall.details.wallLength && originalWall.details.wallLength > 0) {
            const { start, end } = originalWall.pdfPosition;
            const originalPdfDistance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
            if (originalPdfDistance > 0) {
                const scaleRatio = originalWall.details.wallLength / originalPdfDistance;
                const newPdfDistance = updatedWall.details.wallLength / scaleRatio;
                const vectorX = end.x - start.x;
                const vectorY = end.y - start.y;
                const newEnd = {
                    x: start.x + (vectorX / originalPdfDistance) * newPdfDistance,
                    y: start.y + (vectorY / originalPdfDistance) * newPdfDistance,
                };
                finalWall = { ...updatedWall, pdfPosition: { ...updatedWall.pdfPosition, end: newEnd } };
            }
        }
        
        setWalls(prev => prev.map(w => w.id === finalWall.id ? finalWall : w));
        setSelectedWall(null);
    };


    const handleDeleteWall = (id: string) => {
        setWalls(prev => {
            const wallToDelete = prev.find(w => w.id === id);
            if (!wallToDelete) return prev;
            // Find all children and move them up a level
            const childrenIds = prev.filter(w => w.parentId === id).map(c => c.id);
            const grandParentId = wallToDelete.parentId;

            return prev
                .filter(w => w.id !== id)
                .map(w => childrenIds.includes(w.id) ? { ...w, parentId: grandParentId } : w);
        });
        if (selectedWall?.id === id) setSelectedWall(null);
        if (clickedWallId === id) setClickedWallId(null);
    };
    
    const generateNewWallName = (originalName: string, allWalls: Wall[]): string => {
        const getBaseName = (name: string) => name.replace(/(\s\(Copy\))|(\s\d+)$/g, '').trim();
        const baseName = getBaseName(originalName);
        const matchingWalls = allWalls.filter(w => getBaseName(w.name) === baseName);
    
        let maxNumber = 0;
        matchingWalls.forEach(w => {
            if (w.name === baseName) {
                maxNumber = Math.max(maxNumber, 1);
                return;
            }
            const numMatch = w.name.match(/ (\d+)$/);
            if (numMatch) {
                maxNumber = Math.max(maxNumber, parseInt(numMatch[1], 10));
            }
        });
    
        const newNumber = maxNumber + 1;
        return `${baseName} ${newNumber}`;
    };

    const handleDuplicateWall = (wallToDuplicate: Wall) => {
        const newWall: Wall = {
            ...JSON.parse(JSON.stringify(wallToDuplicate)),
            id: generateId(),
            name: generateNewWallName(wallToDuplicate.name, walls),
            pdfPosition: undefined,
            parentId: null, // Duplicated walls start at the root level
        };
        setWalls(prev => [...prev, newWall]);
    };

    const handleCopyWallDetails = (wallId: string) => {
        const wallToCopy = walls.find(w => w.id === wallId);
        if (wallToCopy) {
            setCopiedWallDetails(wallToCopy);
        }
    };

    const handlePasteWallDetails = () => {
        if (!copiedWallDetails) return;
        const newWall: Wall = {
            ...JSON.parse(JSON.stringify(copiedWallDetails)),
            id: generateId(),
            name: generateNewWallName(copiedWallDetails.name, walls),
            floorId: activeFloorId,
            pdfPosition: undefined,
            parentId: null,
        };
        setWalls(prev => [...prev, newWall]);
        setWallToPlace(newWall);
    };

    const handleCopyLayout = (wallIds: string[]) => {
        const wallsToCopy = walls.filter(w => wallIds.includes(w.id) && w.pdfPosition);
        if (wallsToCopy.length === 0) return;

        let minX = Infinity, minY = Infinity;
        wallsToCopy.forEach(w => {
            minX = Math.min(minX, w.pdfPosition!.start.x, w.pdfPosition!.end.x);
            minY = Math.min(minY, w.pdfPosition!.start.y, w.pdfPosition!.end.y);
        });
        const anchor: Point = { x: minX, y: minY };

        const relativeWalls = wallsToCopy.map(w => {
            const relStart = { x: w.pdfPosition!.start.x - anchor.x, y: w.pdfPosition!.start.y - anchor.y };
            const relEnd = { x: w.pdfPosition!.end.x - anchor.x, y: w.pdfPosition!.end.y - anchor.y };
            return { 
                ...JSON.parse(JSON.stringify(w)), 
                pdfPosition: { ...w.pdfPosition!, start: relStart, end: relEnd } 
            };
        });

        setCopiedLayout({ walls: relativeWalls, anchor });
        setSelectedPdfWallIds(new Set());
    };

    const handlePasteLayout = (pastePoint: Point, pageNum: number) => {
        if (!copiedLayout) return;

        const newWalls: Wall[] = [];
        let tempAllWalls = [...walls];

        copiedLayout.walls.forEach(relWall => {
            const newStart = { x: relWall.pdfPosition!.start.x + pastePoint.x, y: relWall.pdfPosition!.start.y + pastePoint.y };
            const newEnd = { x: relWall.pdfPosition!.end.x + pastePoint.x, y: relWall.pdfPosition!.end.y + pastePoint.y };
            
            const newName = generateNewWallName(relWall.name, tempAllWalls);

            const newWall = {
                ...relWall,
                id: generateId(),
                name: newName,
                parentId: null, 
                floorId: activeFloorId,
                pdfPosition: { start: newStart, end: newEnd, pageNum: pageNum },
            };
            
            newWalls.push(newWall);
            tempAllWalls.push(newWall);
        });

        setWalls(prev => [...prev, ...newWalls]);
    };

    const handleCalculateMaterials = useCallback(async () => {
        if (walls.length === 0) {
            setMaterials(null);
            return;
        }
        setIsLoading(true);
        try {
            const { list, byWall, byFloor } = calculateProjectMaterials(walls, floors);
            const proTip = await getProTip(walls);
            const totalLinearFeet = walls.reduce((acc, wall) => acc + wall.details.wallLength, 0) / 12;

            setMaterials({
                list,
                byWall,
                byFloor,
                proTip,
                totalWalls: walls.length,
                totalLinearFeet: Math.round(totalLinearFeet),
            });
        } catch (error) {
            console.error("Failed to calculate materials or get pro tip:", error);
            const { list, byWall, byFloor } = calculateProjectMaterials(walls, floors);
             const totalLinearFeet = walls.reduce((acc, wall) => acc + wall.details.wallLength, 0) / 12;
            setMaterials({
                list,
                byWall,
                byFloor,
                proTip: 'Could not retrieve a pro tip. Please check your API key and connection.',
                totalWalls: walls.length,
                totalLinearFeet: Math.round(totalLinearFeet),
            });
        } finally {
            setIsLoading(false);
        }
    }, [walls, floors]);

    const handleDownloadPdfClick = () => {
        if (materials) {
            setIsPdfOptionsModalOpen(true);
        }
    };
    
    const handleGeneratePdfWithOptions = (format: 'both' | 'breakdown' | 'consolidated' | 'by-floor') => {
        if (materials) {
            generateMaterialListPdf(walls, materials, format);
        }
        setIsPdfOptionsModalOpen(false);
    };

    const handleDownloadReport = () => {
        if (!materials) return;
        const wallImages = walls.map(wall => {
            const canvas = document.createElement('canvas');
            drawWallOnCanvas(canvas, wall.details);
            return canvas.toDataURL('image/png');
        });
        generateMaterialReportPdf(walls, materials, wallImages);
    };

    const handleExportSketchUpScript = () => {
        if (walls.length === 0) return;
        const scriptContent = generateSketchUpScript(walls, floors);
        const blob = new Blob([scriptContent], { type: 'text/ruby' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'framing_project.rb';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleExportPly = () => {
        if (walls.length === 0) return;
        const plyContent = generatePlyModel(walls, floors);
        const blob = new Blob([plyContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'framing_project_web_viewer.ply';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    const handlePdfImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            setFloorPdfs(prev => ({ ...prev, [activeFloorId]: file }));
        }
    };
    
    const activePdfFile = floorPdfs[activeFloorId] || null;

    const handlePdfClose = () => {
        setFloorPdfs(prev => {
            const next = { ...prev };
            delete next[activeFloorId];
            return next;
        });
        setWallToPlace(null);
        setIsPdfDetached(false);
    };

    const handleSaveProject = async () => {
        if (walls.length === 0 && Object.keys(floorPdfs).length === 0) return;
        try {
            const pdfsData: Record<string, {name: string, dataUrl: string}> = {};
            // Type the entries to ensure 'file' is treated as File
            for (const [fid, file] of Object.entries(floorPdfs) as [string, File][]) {
                pdfsData[fid] = { name: file.name, dataUrl: await fileToDataUrl(file) };
            }

            const projectData = JSON.stringify({ walls, floors, pdfsData }, null, 2);
            const blob = new Blob([projectData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `framing-project-${Date.now()}.framingpro`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to save project:", error);
            alert("An error occurred while trying to save the project.");
        }
    };

    const resetProject = () => {
        setWalls([]);
        setFloors([{ id: 'floor-1', name: '1st Floor', elevation: 0 }]);
        setActiveFloorId('floor-1');
        setPdfPageNum(1);
        setSelectedWall(null);
        setMaterials(null);
        setIsLoading(false);
        setFloorPdfs({});
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIs3dViewOpen(false);
        setAssemblyWall(null);
        setIsAddWallModalOpen(false);
        setWallToPlace(null);
        setHighlightedWallId(null);
        setClickedWallId(null);
        setWallToFocusId(null);
        setMaterialViewMode('total');
        setCopiedWallDetails(null);
        setIsPdfOptionsModalOpen(false);
        setCollapsedParents({});
        setSelectedWallIds(new Set());
        setSelectedPdfWallIds(new Set());
        setCopiedLayout(null);
        setDraggedId(null);
        setDragOverState(null);
        setCollapsedFloors({});
        setPropertyClipboard(null);
        setIsPdfDetached(false);
        setLastInteractedWallId(null);
    };

    const handleCloseProject = () => {
         if (walls.length > 0 || Object.keys(floorPdfs).length > 0) {
            if (!window.confirm("Start new project? Any unsaved changes will be lost.")) return;
        }
        resetProject();
    };

    const handleLoadProjectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (walls.length > 0 && !window.confirm("Loading a new project will overwrite your current work. Are you sure you want to continue?")) {
            if (event.target) event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
            try {
                const text = e.target?.result as string;
                const parsed = JSON.parse(text);
                const projectData = parsed as LoadedProjectData;

                if (!projectData || !Array.isArray(projectData.walls)) {
                    throw new Error("Invalid project file format.");
                }
                
                let loadedFloors = projectData.floors;
                if (!loadedFloors || !Array.isArray(loadedFloors) || loadedFloors.length === 0) {
                     loadedFloors = [{ id: 'floor-1', name: '1st Floor', elevation: 0 }];
                }

                const primaryFloorId = loadedFloors[0].id;
                
                // Migrate legacy walls: if floorId is missing, assign the primary floor ID
                const migratedWalls = projectData.walls.map((w: Wall) => ({
                    ...w,
                    floorId: w.floorId || primaryFloorId
                }));
                
                // Migrate legacy scales if present
                if (projectData.pdfScales) {
                    loadedFloors = loadedFloors.map(f => {
                         if (f.pdfPage && projectData.pdfScales?.[f.pdfPage]) {
                             return { ...f, scale: projectData.pdfScales[f.pdfPage] };
                         }
                         return f;
                    });
                }
                
                setWalls(migratedWalls);
                setFloors(loadedFloors);
                setActiveFloorId(primaryFloorId);
                
                if (projectData.pdfData && projectData.pdfData.dataUrl) {
                    // Legacy single PDF support
                    const newPdfFile = dataURLtoFile(projectData.pdfData.dataUrl, projectData.pdfData.name);
                    setFloorPdfs({ [primaryFloorId]: newPdfFile });
                } else if (projectData.pdfsData) {
                    // New multi-PDF support
                    const newPdfs: Record<string, File> = {};
                    const pdfsData = projectData.pdfsData as Record<string, {name: string, dataUrl: string}>;
                    for(const [fid, data] of Object.entries(pdfsData)) {
                        newPdfs[fid] = dataURLtoFile(data.dataUrl, data.name);
                    }
                    setFloorPdfs(newPdfs);
                } else {
                    setFloorPdfs({});
                }
                
                setCollapsedParents({});
                setSelectedWall(null);
                setMaterials(null);
                setAssemblyWall(null);
                setIs3dViewOpen(false);
                setWallToPlace(null);
                setCopiedWallDetails(null);
                setSelectedWallIds(new Set());
                setClickedWallId(null);
                setPdfPageNum(1);
                setCollapsedFloors({});
                setPropertyClipboard(null);
                setIsPdfDetached(false);
                setLastInteractedWallId(null);
                
            } catch (error) {
                console.error("Failed to load project:", error);
                alert("Failed to load project file. It may be corrupted or in an invalid format.");
            } finally {
                 if (event.target) event.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const triggerLoadProject = () => {
        fileInputRef.current?.click();
    };
    
    const handleSetClickedWall = (wallId: string | null, e?: React.MouseEvent) => {
        const isMultiSelect = e?.ctrlKey || e?.metaKey;
        const isRangeSelect = e?.shiftKey;

        // Selection Logic via Row Click
        if (wallId) {
            if (isRangeSelect && lastInteractedWallId) {
                const startIndex = visibleWallIds.indexOf(lastInteractedWallId);
                const endIndex = visibleWallIds.indexOf(wallId);
                if (startIndex !== -1 && endIndex !== -1) {
                    const start = Math.min(startIndex, endIndex);
                    const end = Math.max(startIndex, endIndex);
                    const rangeIds = visibleWallIds.slice(start, end + 1);
                    setSelectedWallIds(prev => {
                        const next = new Set(prev);
                        rangeIds.forEach(id => next.add(id));
                        return next;
                    });
                }
            } else if (isMultiSelect) {
                handleToggleWallSelection(wallId, false);
            } else {
                // Focus Logic (Highlight on PDF)
                const newClickedId = clickedWallId === wallId ? null : wallId;
                setClickedWallId(newClickedId);
                
                // Update anchor for next potential shift click
                setLastInteractedWallId(wallId);
                
                // standard OS row click also selects the row
                setSelectedWallIds(new Set([wallId]));
            }
        }

        // Expanded logic for ensuring wall visibility
        if (wallId) {
            const wall = walls.find(w => w.id === wallId);
            if(wall && wall.floorId !== activeFloorId) {
                setActiveFloorId(wall.floorId || floors[0].id);
            }

            const ancestorIds = getAncestorIds(wallId);
            if (ancestorIds.length > 0) {
                setCollapsedParents(prev => {
                    const newCollapsed = { ...prev };
                    ancestorIds.forEach(id => {
                        delete newCollapsed[id];
                    });
                    return newCollapsed;
                });
            }
            
            if (wall?.pdfPosition) {
                setWallToFocusId(wallId);
            }
        }
    };

    const handleUpdateWallFloor = (wallId: string, newFloorId: string) => {
        setWalls(prev => prev.map(w => w.id === wallId ? { ...w, floorId: newFloorId } : w));
    };


    const toggleParent = (parentId: string) => {
        setCollapsedParents(prev => ({ ...prev, [parentId]: !prev[parentId] }));
    };
    
    const toggleFloorCollapse = (floorId: string) => {
        setCollapsedFloors(prev => ({ ...prev, [floorId]: !prev[floorId] }));
    };
    
    // --- Floor Helpers ---
    const activeFloor = floors.find(f => f.id === activeFloorId);
    
    const handleAddFloor = (name: string, elevation: number, pdfPage?: number) => {
        const id = generateId();
        setFloors(prev => [...prev, { id, name, elevation, pdfPage }]);
        setActiveFloorId(id);
        if (pdfPage) {
            setPdfPageNum(pdfPage);
        }
    };

    const handleUpdateFloor = (id: string, updates: Partial<Floor>) => {
        setFloors(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
        // Immediate sync if active floor's page is changed
        if (id === activeFloorId && updates.pdfPage !== undefined) {
            setPdfPageNum(updates.pdfPage);
        }
    };
    
    const handleDeleteFloor = (id: string) => {
        if (floors.length <= 1) return;
        setFloors(prev => prev.filter(f => f.id !== id));
        setWalls(prev => prev.filter(w => w.floorId !== id)); // Optionally keep walls but unassign? Deleting for safety.
        // Also remove PDF
        setFloorPdfs(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        if (activeFloorId === id) setActiveFloorId(floors[0].id);
    };

    const handleSetActiveFloor = (id: string) => {
        setActiveFloorId(id);
        const floor = floors.find(f => f.id === id);
        if (floor && floor.pdfPage) {
            setPdfPageNum(floor.pdfPage);
        }
    };
    
    const handleSetScale = (scale: number) => {
        setFloors(prev => prev.map(f => f.id === activeFloorId ? { ...f, scale } : f));
    };

    const handleTogglePdfDetach = () => {
        setIsPdfDetached(prev => !prev);
    };

    const handleIndentWall = (wallId: string) => {
        // Logic needs to be aware of the floor context
        const wall = walls.find(w => w.id === wallId);
        if(!wall) return;
        
        const floorId = wall.floorId || floors[0].id;
        const flatList = wallsByFloor[floorId];
        
        const wallIndex = flatList.findIndex(item => item.wall.id === wallId);
        if (wallIndex <= 0) return;

        const wallToIndent = flatList[wallIndex];
        const potentialParent = flatList[wallIndex - 1];
        
        if (potentialParent.level >= wallToIndent.level) {
            setWalls(currentWalls => currentWalls.map(w => w.id === wallId ? { ...w, parentId: potentialParent.wall.id } : w));
        }
    };
    
    const handleOutdentWall = (wallId: string) => {
        const wallToOutdent = walls.find(w => w.id === wallId);
        if (!wallToOutdent || !wallToOutdent.parentId) return;

        const parent = walls.find(w => w.id === wallToOutdent.parentId);
        const newParentId = parent ? parent.parentId : null;

        setWalls(currentWalls => currentWalls.map(w => w.id === wallId ? { ...w, parentId: newParentId } : w));
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, wallId: string) => {
        e.dataTransfer.setData('wallId', wallId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => setDraggedId(wallId), 0);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
        setDragOverState(null);
    };

    const handleDragOver = (e: React.DragEvent, wallId: string) => {
        e.preventDefault();
        // Allow dropping if we are not dragging over ourselves, OR if we have a multi-selection and we are hovering something not in selection
        const isSelf = draggedId === wallId;
        const inSelection = selectedWallIds.has(wallId) && selectedWallIds.has(draggedId || '');
        
        if (draggedId === null || (isSelf && !inSelection)) {
             if (dragOverState !== null) setDragOverState(null);
             return;
        }

        const targetElement = e.currentTarget as HTMLElement;
        const rect = targetElement.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        let position: DragPosition;
        if (y < height * 0.25) position = 'above';
        else if (y > height * 0.75) position = 'below';
        else position = 'on';

        if (dragOverState?.targetId !== wallId || dragOverState?.position !== position) {
            setDragOverState({ targetId: wallId, position });
        }
    };

    const handleDragLeave = (wallId: string) => {
        if (dragOverState?.targetId === wallId) {
            setDragOverState(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (!draggedId || !dragOverState) {
            handleDragEnd();
            return;
        }

        const { targetId, position } = dragOverState;
        
        // Determine items to move: either the single dragged item, OR all selected items if the dragged item is part of the selection
        const idsToMove = (selectedWallIds.has(draggedId)) 
            ? Array.from(selectedWallIds) 
            : [draggedId];

        // Validation: Cannot drop onto itself or into a descendant of any moving item
        if (idsToMove.includes(targetId)) {
             handleDragEnd();
             return;
        }

        // Check if target is a descendant of ANY of the moving items
        for (const movingId of idsToMove) {
             const descendants = findDescendantIds(movingId, walls);
             if (descendants.includes(targetId)) {
                 handleDragEnd();
                 return;
             }
        }

        let updatedWalls = [...walls];
        const targetItem = updatedWalls.find(w => w.id === targetId)!;
        
        // Determine Target Parent and Insertion Index
        let newParentId: string | null = null;
        let insertIndex = -1;
        
        if (position === 'on') {
            newParentId = targetId;
            // Insert at the end of target's children
            const targetDescendants = findDescendantIds(targetId, updatedWalls);
            const lastDescendantId = targetDescendants.length > 0 ? targetDescendants[targetDescendants.length - 1] : targetId;
            insertIndex = updatedWalls.findIndex(w => w.id === lastDescendantId) + 1;
        } else {
            newParentId = targetItem.parentId || null;
            const targetIndex = updatedWalls.findIndex(w => w.id === targetId);
            insertIndex = position === 'above' ? targetIndex : targetIndex + 1;
        }

        // Filter out moving items from list to prepare for re-insertion
        const movingItems = idsToMove.map(id => updatedWalls.find(w => w.id === id)!).filter(Boolean);
        updatedWalls = updatedWalls.filter(w => !idsToMove.includes(w.id));
        
        // Adjust insertion index because removing items might have shifted indices
        if (position === 'on') {
             const targetDescendants = findDescendantIds(targetId, updatedWalls);
             const lastDescendantId = targetDescendants.length > 0 ? targetDescendants[targetDescendants.length - 1] : targetId;
             const idx = updatedWalls.findIndex(w => w.id === lastDescendantId);
             insertIndex = idx + 1;
        } else {
             const tIdx = updatedWalls.findIndex(w => w.id === targetId);
             insertIndex = position === 'above' ? tIdx : tIdx + 1;
        }

        // Apply updates to moving items
        movingItems.forEach(item => {
            item.parentId = newParentId;
            item.floorId = targetItem.floorId || floors[0].id;
        });

        // Insert items
        updatedWalls.splice(insertIndex, 0, ...movingItems);

        setWalls(updatedWalls);
        handleDragEnd();
    };

    if (isAuthLoading || isProfileLoading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-slate-400 animate-pulse">
                        {isAuthLoading ? 'Checking authentication...' : 'Verifying profile...'}
                    </span>
                </div>
            </div>
        );
    }

    if (!user) {
        return <LandingPage onLogin={handleGoogleSignIn} />;
    }

    // --- Approval Checks ---
    if (userProfile && userProfile.status === 'pending') {
        return <PendingApprovalScreen onSignOut={handleSignOut} />;
    }
    
    if (userProfile && userProfile.status === 'rejected') {
        return <RejectedScreen onSignOut={handleSignOut} />;
    }

    return (
        <>
            <AdminUserModal isOpen={isAdminModalOpen} onClose={() => setIsAdminModalOpen(false)} />
            <input type="file" ref={fileInputRef} onChange={handleLoadProjectFile} accept=".framingpro,.json" className="hidden" />
            <AddWallModal 
                isOpen={isAddWallModalOpen}
                onClose={() => setIsAddWallModalOpen(false)}
                onCreate={handleCreateWall}
                defaultName={`Wall ${walls.length + 1}`}
            />
            <PdfOptionsModal
                isOpen={isPdfOptionsModalOpen}
                onClose={() => setIsPdfOptionsModalOpen(false)}
                onGenerate={handleGeneratePdfWithOptions}
            />
            <FloorManagerModal 
                isOpen={isFloorManagerOpen}
                onClose={() => setIsFloorManagerOpen(false)}
                floors={floors}
                activeFloorId={activeFloorId}
                onAddFloor={handleAddFloor}
                onUpdateFloor={handleUpdateFloor}
                onSetActiveFloor={handleSetActiveFloor}
                onDeleteFloor={handleDeleteFloor}
                currentPage={pdfPageNum}
            />
            
            {activePdfFile && isPdfDetached && (
                <PopOutWindow title="Framing Plan Viewer" onClose={handleTogglePdfDetach}>
                     <PdfViewer 
                        file={activePdfFile} 
                        onClose={handlePdfClose} 
                        onAddWall={handleAddWallFromPdf}
                        projectWalls={walls.filter(w => w.floorId === activeFloorId || (!w.floorId && activeFloorId === floors[0]?.id))}
                        wallToPlace={wallToPlace}
                        onWallPlaced={handleWallPlaced}
                        highlightedWallId={highlightedWallId}
                        clickedWallId={clickedWallId}
                        setClickedWallId={handleSetClickedWall}
                        wallToFocusId={wallToFocusId}
                        onFocusDone={() => setWallToFocusId(null)}
                        onCopyWallDetails={handleCopyWallDetails}
                        onPasteWallDetails={handlePasteWallDetails}
                        selectedPdfWallIds={selectedPdfWallIds}
                        setSelectedPdfWallIds={setSelectedPdfWallIds}
                        copiedLayout={copiedLayout}
                        onCopyLayout={handleCopyLayout}
                        onPasteLayout={handlePasteLayout}
                        currentPage={pdfPageNum}
                        onPageChange={setPdfPageNum}
                        activeScale={activeFloor?.scale}
                        onSetScale={handleSetScale}
                        onDetach={handleTogglePdfDetach}
                        isDetached={true}
                    />
                </PopOutWindow>
            )}

            {selectedWall ? (
                <div className="p-4 md:p-8" style={{ marginLeft: (activePdfFile && !isPdfDetached) ? `${pdfPanelWidth}px` : 0, transition: 'margin-left 0.1s ease-out' }}>
                    <WallEditor wall={selectedWall} onSave={handleSaveWall} onCancel={() => setSelectedWall(null)} />
                </div>
            ) : (
                <div style={{ marginLeft: (activePdfFile && !isPdfDetached) ? `${pdfPanelWidth}px` : 0, transition: 'margin-left 0.1s ease-out' }}>
                    <header className="bg-slate-800/50 backdrop-blur-sm sticky top-0 z-10 border-b border-slate-700/50">
                        <div className="container mx-auto p-4 flex justify-between items-center">
                            <h1 className="text-2xl md:text-3xl font-bold text-indigo-400 flex items-center gap-3"><ProjectIcon className="w-8 h-8"/>Framing Calculator Pro</h1>
                            <div className="flex items-center gap-2">
                                <button onClick={() => setIsFloorManagerOpen(true)} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition border border-slate-600 mr-2">
                                    <FolderIcon className="w-5 h-5"/>
                                    <div className="text-left hidden md:block">
                                        <div className="text-xs text-slate-400 font-normal">Active Floor</div>
                                        <div className="font-semibold text-sm leading-none">{activeFloor?.name || 'Unknown'}</div>
                                    </div>
                                </button>
                                
                                <button onClick={triggerLoadProject} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-4 rounded-lg transition">
                                    <LoadIcon className="w-5 h-5" /><span className="hidden sm:inline">Load</span>
                                </button>
                                <button onClick={handleSaveProject} disabled={walls.length === 0 && Object.keys(floorPdfs).length === 0} className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:bg-slate-600 disabled:cursor-not-allowed">
                                    <SaveIcon className="w-5 h-5" /><span className="hidden sm:inline">Save</span>
                                </button>
                                <button onClick={handleCloseProject} className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded-lg transition">
                                    <CloseIcon className="w-5 h-5" /><span className="hidden sm:inline">Close</span>
                                </button>
                                <div className="w-px h-8 bg-slate-700 mx-1"></div>
                                 <label className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition cursor-pointer">
                                    <PdfIcon className="w-5 h-5" /><span className="hidden sm:inline">PDF</span><input type="file" accept="application/pdf" className="hidden" onChange={handlePdfImport} />
                                 </label>
                                <button onClick={handleExportSketchUpScript} disabled={walls.length === 0} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:bg-slate-600 disabled:cursor-not-allowed">
                                    <SketchupIcon className="w-5 h-5" /><span className="hidden sm:inline">SketchUp</span>
                                </button>
                                <button onClick={handleExportPly} disabled={walls.length === 0} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition disabled:bg-slate-600 disabled:cursor-not-allowed" title="Export for Web Viewer (3dviewer.net)">
                                    <CubeIcon className="w-5 h-5" /><span className="hidden sm:inline">Web 3D</span>
                                </button>

                                <div className="w-px h-8 bg-slate-700 mx-1"></div>
                                
                                {isAdmin && (
                                    <button onClick={() => setIsAdminModalOpen(true)} className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition mr-1">
                                        <div className="w-5 h-5 flex items-center justify-center">👑</div>
                                        <span className="hidden md:inline">Manage Users</span>
                                    </button>
                                )}

                                <button onClick={handleSignOut} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg transition border border-slate-600" title={`Signed in as ${user.email}`}>
                                    <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold overflow-hidden">
                                        {user.photoURL ? <img src={user.photoURL} alt="User" className="w-full h-full object-cover" /> : (user.email ? user.email[0].toUpperCase() : 'U')}
                                    </div>
                                    <span className="hidden md:inline text-xs">{user.displayName || user.email?.split('@')[0]}</span>
                                    <LogoutIcon className="w-4 h-4 text-slate-400" />
                                </button>
                            </div>
                        </div>
                    </header>
                    <main className="container mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                        <div className="lg:col-span-2">
                             <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-4">
                                    <h2 className="text-2xl font-semibold">Project Walls</h2>
                                    {selectedWallIds.size > 0 && (
                                        <button 
                                            onClick={() => {
                                                setSelectedWallIds(new Set());
                                                setLastInteractedWallId(null);
                                            }}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20 transition flex items-center gap-1"
                                        >
                                            <CloseIcon className="w-3 h-3" /> Deselect All ({selectedWallIds.size})
                                        </button>
                                    )}
                                    <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider hidden sm:block">
                                        Shift + Click Range
                                    </span>
                                </div>
                                <button onClick={() => setIsAddWallModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition">
                                    <PlusIcon className="w-5 h-5" /> Add Wall
                                </button>
                            </div>
                            
                            {walls.length === 0 ? (
                                <div className="text-center py-16 px-6 bg-slate-800 rounded-lg border-2 border-dashed border-slate-700">
                                    <p className="text-slate-400 mb-4">No walls in your project yet.</p>
                                    <button onClick={() => setIsAddWallModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg transition">Add Your First Wall</button>
                                </div>
                            ) : (
                                <div className="bg-slate-800 rounded-lg shadow-lg overflow-hidden border border-slate-700">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-900 border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                                                    <th className="p-3 w-10 text-center"></th>
                                                    <th className="p-3 font-semibold">Name</th>
                                                    <th className="p-3 font-semibold">Length</th>
                                                    <th className="p-3 font-semibold">Height</th>
                                                    <th className="p-3 font-semibold">Stud Config</th>
                                                    <th className="p-3 font-semibold">Floor</th>
                                                    <th className="p-3 font-semibold">Details</th>
                                                    <th className="p-3 font-semibold">Openings</th>
                                                    <th className="p-3 font-semibold w-32">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {floors.map(floor => (
                                                    <React.Fragment key={floor.id}>
                                                        {wallsByFloor[floor.id] && wallsByFloor[floor.id].length > 0 && (
                                                            <>
                                                                <tr 
                                                                    className="bg-slate-700/50 border-y border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors"
                                                                    onClick={() => toggleFloorCollapse(floor.id)}
                                                                >
                                                                    <td colSpan={9} className="px-4 py-2 text-sm font-bold text-indigo-300">
                                                                        <div className="flex items-center gap-2">
                                                                            {collapsedFloors[floor.id] ? (
                                                                                <ChevronRightIcon className="w-4 h-4" />
                                                                            ) : (
                                                                                <ChevronDownIcon className="w-4 h-4" />
                                                                            )}
                                                                            {floor.name}
                                                                            <span className="text-slate-400 text-xs font-normal ml-2">({wallsByFloor[floor.id].length} walls)</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {!collapsedFloors[floor.id] && wallsByFloor[floor.id].map(item => (
                                                                    <WallRow 
                                                                        key={item.wall.id} 
                                                                        node={item} 
                                                                        floors={floors}
                                                                        walls={walls}
                                                                        collapsedParents={collapsedParents}
                                                                        draggedId={draggedId}
                                                                        dragOverState={dragOverState}
                                                                        wallsByFloor={wallsByFloor}
                                                                        hasActivePdf={!!activePdfFile}
                                                                        selectedIds={selectedWallIds}
                                                                        isClicked={item.wall.id === clickedWallId}
                                                                        getDescendantIds={getDescendantIds}
                                                                        onToggleSelection={handleToggleWallSelection}
                                                                        onWallClick={handleSetClickedWall}
                                                                        onUpdateFloor={handleUpdateWallFloor}
                                                                        onCopyProperties={handleCopyWallProperties}
                                                                        toggleParent={toggleParent}
                                                                        handleIndentWall={handleIndentWall}
                                                                        handleOutdentWall={handleOutdentWall}
                                                                        handleDragStart={handleDragStart}
                                                                        handleDragOver={handleDragOver}
                                                                        handleDragLeave={handleDragLeave}
                                                                        handleDrop={handleDrop}
                                                                        handleDragEnd={handleDragEnd}
                                                                        setHighlightedWallId={setHighlightedWallId}
                                                                        setWallToPlace={setWallToPlace}
                                                                        setAssemblyWall={setAssemblyWall}
                                                                        handleDuplicateWall={handleDuplicateWall}
                                                                        setSelectedWall={setSelectedWall}
                                                                        handleDeleteWall={handleDeleteWall}
                                                                    />
                                                                ))}
                                                            </>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="lg:col-span-1">
                            <div className="bg-slate-800 rounded-lg p-6 sticky top-24">
                                <h2 className="text-2xl font-semibold mb-4">Material List</h2>
                                <button onClick={handleCalculateMaterials} disabled={isLoading || walls.length === 0} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:bg-slate-600 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                    {isLoading ? 'Calculating...' : 'Generate Material List'}
                                </button>
                                {materials ? (
                                    <div className="mt-6">
                                        <div className="flex justify-between items-center mb-4">
                                            <div className="flex items-baseline gap-4 text-sm">
                                                <h3 className={`font-semibold cursor-pointer ${materialViewMode === 'total' ? 'text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setMaterialViewMode('total')}>Total</h3>
                                                <h3 className={`font-semibold cursor-pointer ${materialViewMode === 'floor' ? 'text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setMaterialViewMode('floor')}>By Floor</h3>
                                                <h3 className={`font-semibold cursor-pointer ${materialViewMode === 'wall' ? 'text-white border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setMaterialViewMode('wall')}>By Wall</h3>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={handleDownloadPdfClick} className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300" title="Download Material List (Text Only)"><DownloadIcon className="w-5 h-5"/></button>
                                                <button onClick={handleDownloadReport} className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300" title="Download Full Report (with Diagrams)"><DocumentReportIcon className="w-5 h-5"/></button>
                                            </div>
                                        </div>
                                        <div className="max-h-96 overflow-y-auto pr-2 mb-4 custom-scrollbar">
                                            {materialViewMode === 'wall' && (
                                                <div className="space-y-4">
                                                    {Object.keys(materials.byWall).map((wallId) => {
                                                        const wallData = materials.byWall[wallId];
                                                        return (
                                                            <div key={wallId} onMouseEnter={() => setHighlightedWallId(wallId)} onMouseLeave={() => setHighlightedWallId(null)} className="p-3 bg-slate-900/70 rounded-lg border border-slate-700/50">
                                                                <h4 className="font-semibold text-indigo-400 mb-2 text-base">{wallData.wallName}</h4>
                                                                <table className="w-full text-left text-sm">
                                                                    <tbody className="divide-y divide-slate-700/50">
                                                                        {wallData.materials.map((item, index) => (
                                                                            <tr key={index}>
                                                                                <td className="py-1 pr-2 w-8 font-medium">{item.quantity}</td>
                                                                                <td className="py-1 pr-2 text-slate-300">{item.description}</td>
                                                                                <td className="py-1 text-slate-300 text-right">{((l) => typeof l === 'string' ? l : l > 0 ? `${l / 12}'` : 'Sheet')(item.length)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {materialViewMode === 'floor' && (
                                                <div className="space-y-4">
                                                     {materials.byFloor && Object.keys(materials.byFloor).map((floorId) => {
                                                        const floorData = materials.byFloor[floorId];
                                                        return (
                                                            <div key={floorId} className="p-3 bg-slate-900/70 rounded-lg border border-slate-700/50">
                                                                <h4 className="font-semibold text-green-400 mb-2 text-base">{floorData.floorName}</h4>
                                                                <table className="w-full text-left text-sm">
                                                                    <tbody className="divide-y divide-slate-700/50">
                                                                        {floorData.materials.map((item, index) => (
                                                                            <tr key={index}>
                                                                                <td className="py-1 pr-2 w-8 font-medium">{item.quantity}</td>
                                                                                <td className="py-1 pr-2 text-slate-300">{item.description}</td>
                                                                                <td className="py-1 text-slate-300 text-right">{((l) => typeof l === 'string' ? l : l > 0 ? `${l / 12}'` : 'Sheet')(item.length)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {materialViewMode === 'total' && (
                                                <table className="w-full text-left text-sm">
                                                    <thead><tr className="border-b border-slate-700"><th className="py-2 font-semibold">Qty</th><th className="py-2 font-semibold">Description</th><th className="py-2 font-semibold text-right">Length</th></tr></thead>
                                                    <tbody className="divide-y divide-slate-700/50">{materials.list.map((item, index) => (<tr key={index}><td className="py-2 pr-2 font-medium">{item.quantity}</td><td className="py-2 pr-2 text-slate-300">{item.description}</td><td className="py-2 text-slate-300 text-right">{((l) => typeof l === 'string' ? l : l > 0 ? `${l / 12}'` : 'Sheet')(item.length)}</td></tr>))}</tbody>
                                                </table>
                                            )}
                                        </div>
                                        {materials.proTip && (<div className="mt-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700"><h4 className="font-bold text-indigo-400 mb-2">Pro Tip from Gemini</h4><p className="text-sm text-slate-300 whitespace-pre-wrap">{materials.proTip}</p></div>)}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 px-4 mt-6 bg-slate-900/50 rounded-lg border border-slate-700"><p className="text-slate-400">Your generated material list will appear here.</p></div>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            )}
            {selectedWallIds.size > 0 && <BulkEditPanel selectedCount={selectedWallIds.size} floors={floors} onApply={handleApplyBulkEdit} onClear={() => setSelectedWallIds(new Set())} style={{ left: (activePdfFile && !isPdfDetached) ? `calc(50% + ${pdfPanelWidth / 2}px)` : '50%' }} clipboardDetails={propertyClipboard} onPasteProperties={handlePastePropertiesToSelected} />}
             {activePdfFile && !isPdfDetached && (
                <div 
                    className="fixed inset-y-0 left-0 bg-slate-800 shadow-2xl z-30 border-r border-slate-700 flex"
                    style={{ width: `${pdfPanelWidth}px` }}
                >
                    <div className="flex-grow h-full overflow-hidden">
                        <PdfViewer 
                            file={activePdfFile} 
                            onClose={handlePdfClose} 
                            onAddWall={handleAddWallFromPdf}
                            projectWalls={walls.filter(w => w.floorId === activeFloorId || (!w.floorId && activeFloorId === floors[0]?.id))}
                            wallToPlace={wallToPlace}
                            onWallPlaced={handleWallPlaced}
                            highlightedWallId={highlightedWallId}
                            clickedWallId={clickedWallId}
                            setClickedWallId={handleSetClickedWall}
                            wallToFocusId={wallToFocusId}
                            onFocusDone={() => setWallToFocusId(null)}
                            onCopyWallDetails={handleCopyWallDetails}
                            onPasteWallDetails={handlePasteWallDetails}
                            selectedPdfWallIds={selectedPdfWallIds}
                            setSelectedPdfWallIds={setSelectedPdfWallIds}
                            copiedLayout={copiedLayout}
                            onCopyLayout={handleCopyLayout}
                            onPasteLayout={handlePasteLayout}
                            currentPage={pdfPageNum}
                            onPageChange={setPdfPageNum}
                            activeScale={activeFloor?.scale}
                            onSetScale={handleSetScale}
                            onDetach={handleTogglePdfDetach}
                            isDetached={false}
                        />
                    </div>
                    <div 
                        className="w-2 h-full cursor-col-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors flex items-center justify-center group"
                        onMouseDown={handleMouseDownOnResizer}
                    >
                         <div className="w-1 h-8 bg-slate-600 rounded-full group-hover:bg-indigo-400"/>
                    </div>
                </div>
            )}
            {is3dViewOpen && <Project3DViewer walls={walls} assemblyWall={assemblyWall} onClose={() => { setIs3dViewOpen(false); setAssemblyWall(null); }} />}
        </>
    );
};

export default App;
