
export type StudSize = '2x4' | '2x6';
export type HeaderSize = '2x6' | '2x8' | '2x10' | '2x12';

export interface Opening {
    id: string;
    type: 'window' | 'door';
    quantity: number;
    width: number; // inches
    height: number; // inches
    headerSize: HeaderSize;
    headerPly: 2 | 3;
    kingStudsPerSide: number;
    jackStudsPerSide: number;
    centerOffset?: number; // Distance from start of wall to center of opening
    headerTopOffset?: number; // Distance from bottom of top plate to top of header (Header Drop)
}

export interface WallDetails {
    wallLength: number; // inches
    wallHeight: number; // inches
    studSize: StudSize;
    studSpacing: 8 | 12 | 16 | 24;
    studsOnCenter: 1 | 2 | 3 | 4;
    doubleTopPlate: boolean;
    pressureTreatedBottomPlate: boolean;
    blockingRows: number;
    startStuds: number;
    endStuds: number;
    sheathing: boolean;
    sheathingType: '1/2" OSB' | '1/2" CDX Plywood' | '5/8" Zip System';
    openings: Opening[];
}

export interface Point {
    x: number;
    y: number;
}

export interface Floor {
    id: string;
    name: string;
    elevation: number; // inches from ground (0)
    pdfPage?: number; // The PDF page associated with this floor plan
    scale?: number; // Inches per PDF point
}

export interface Wall {
    id:string;
    name: string;
    floorId?: string;
    details: WallDetails;
    parentId?: string | null;
    pdfPosition?: {
        start: Point;
        end: Point;
        pageNum: number;
    }
}

export interface MaterialItem {
    quantity: number;
    description: string; // e.g., '2x4' or '2x4 Stud'
    length: number | string; // inches, e.g., 96 for 8', or a string for pre-cuts like "92 5/8"
}

export interface FramingMaterials {
    list: MaterialItem[]; // Consolidated list for the whole project
    byWall: Record<string, { wallName: string; materials: MaterialItem[] }>; // Materials broken down by wall ID
    byFloor: Record<string, { floorName: string; materials: MaterialItem[] }>; // Materials broken down by Floor ID
    proTip: string;
    totalWalls: number;
    totalLinearFeet: number;
}

export interface Member3D {
    id: string;
    name: string; // Non-unique name for grouping in external tools like SketchUp
    x: number; y: number; z: number; // position (top-left-front corner)
    w: number; h: number; d: number; // dimensions
    type: 'plate' | 'pt-plate' | 'stud' | 'king-jack' | 'header' | 'sill' | 'cripple' | 'blocking' | 'sheathing';
}