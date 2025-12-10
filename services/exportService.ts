
import type { Wall, Member3D, Floor } from '../types';
import { generateWallMembers } from './geometryService';

const studDepths: { [key: string]: number } = {
    '2x4': 3.5, '2x6': 5.5
};

// RGB Colors for the PLY export
const colors: Record<string, [number, number, number]> = {
    'plate': [202, 138, 4],     // Goldenrod
    'pt-plate': [21, 128, 61],  // Green
    'stud': [161, 98, 7],       // Tan/Brown
    'king-jack': [133, 77, 14], // Darker Brown
    'header': [185, 28, 28],    // Red
    'sill': [202, 138, 4],      // Goldenrod
    'cripple': [161, 98, 7],    // Tan
    'blocking': [194, 65, 12],  // Orange
    'sheathing': [210, 180, 140] // Wheat
};

export const generatePlyModel = (walls: Wall[], floors: Floor[]): string => {
    let vertices: string[] = [];
    let faces: string[] = [];
    let vertexCount = 0;

    // Helper to add a cuboid
    const addCuboid = (
        x: number, y: number, z: number, 
        w: number, h: number, d: number, 
        type: string, 
        transformFn: (lx: number, ly: number, lz: number) => {x: number, y: number, z: number}
    ) => {
        const c = colors[type] || [150, 150, 150];
        const colorStr = `${c[0]} ${c[1]} ${c[2]}`;

        // Local corners of the member (untransformed)
        // We define the box relative to its local origin (0,0,0)
        // 8 corners
        const corners = [
            { lx: 0, ly: 0, lz: 0 },
            { lx: w, ly: 0, lz: 0 },
            { lx: w, ly: h, lz: 0 },
            { lx: 0, ly: h, lz: 0 },
            { lx: 0, ly: 0, lz: d },
            { lx: w, ly: 0, lz: d },
            { lx: w, ly: h, lz: d },
            { lx: 0, ly: h, lz: d },
        ];

        // Transform corners to global space
        corners.forEach(p => {
            // Apply the specific member offset (x,y,z passed in arg) plus the cuboid corner
            const global = transformFn(x + p.lx, y + p.ly, z + p.lz);
            // In PLY, Z is typically UP. 
            // Our TransformFn returns X=Right, Y=Depth(Back), Z=Up
            vertices.push(`${global.x.toFixed(3)} ${global.y.toFixed(3)} ${global.z.toFixed(3)} ${colorStr}`);
        });

        // Add 6 faces (quads), referencing the last 8 vertices added
        const start = vertexCount;
        // Faces defined by vertex indices (Counter-clockwise winding usually)
        // Back
        faces.push(`4 ${start} ${start+3} ${start+2} ${start+1}`);
        // Front
        faces.push(`4 ${start+4} ${start+5} ${start+6} ${start+7}`);
        // Top (in our local coords, Y=0 is top)
        faces.push(`4 ${start} ${start+1} ${start+5} ${start+4}`);
        // Bottom
        faces.push(`4 ${start+3} ${start+7} ${start+6} ${start+2}`);
        // Left
        faces.push(`4 ${start} ${start+4} ${start+7} ${start+3}`);
        // Right
        faces.push(`4 ${start+1} ${start+2} ${start+6} ${start+5}`);

        vertexCount += 8;
    };

    // Calculate scale from reference wall if available
    let pdfToInchesScale = 1.0;
    const scaleReferenceWall = walls.find(w => w.pdfPosition && w.details.wallLength > 0);
    if (scaleReferenceWall) {
        const { start, end } = scaleReferenceWall.pdfPosition!;
        const pdfDistance = Math.hypot(end.x - start.x, end.y - start.y);
        if (pdfDistance > 0.001) {
            pdfToInchesScale = scaleReferenceWall.details.wallLength / pdfDistance;
        }
    }

    const floorMap: Record<string, number> = {};
    floors.forEach(f => floorMap[f.id] = f.elevation);

    // Process Positioned Walls
    const positionedWalls = walls.filter(w => w.pdfPosition);
    
    positionedWalls.forEach(wall => {
        const members = generateWallMembers(wall.details);
        const { start, end } = wall.pdfPosition!;
        
        // Scale PDF points to inches
        const sx = start.x * pdfToInchesScale;
        const sy = start.y * pdfToInchesScale;
        const ex = end.x * pdfToInchesScale;
        const ey = end.y * pdfToInchesScale;

        // Wall Angle in 2D plane (Top down)
        // In our app, PDF Y increases downwards.
        // We want to map this to a 3D world where Z is up.
        // Let's map App X -> World X, App Y -> World Y (Depth).
        const dx = ex - sx;
        const dy = ey - sy;
        const angle = Math.atan2(dy, dx);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const elevation = wall.floorId ? (floorMap[wall.floorId] || 0) : 0;

        // Transform function for this wall
        // Input: local x (along wall), y (vertical down from top), z (depth/thickness)
        // Output: Global X, Global Y, Global Z (Up)
        const transform = (lx: number, ly: number, lz: number) => {
            // 1. Rotate around Z axis (which is our vertical axis in concept, but here we are doing 2D rotation)
            // Local X is along the wall. Local Z is thickness. 
            // We rotate (lx, lz)
            // Wait, wall thickness is 'z' in Member3D, but in top-down view it's perpendicular to the wall line.
            
            // Member coordinates:
            // x: along wall length
            // y: down from top plate (height)
            // z: thickness of wall
            
            // Step 1: Horizontal Rotation
            // We start at sx, sy.
            // We move 'lx' along the wall vector.
            // We move 'lz' perpendicular to the wall vector.
            // 'lz' (depth) should be centered? No, usually flush. 
            // In geometryService, z=0 is usually front face? Or center? 
            // Usually Framing is drawn from 0..Depth.
            
            // X position in World
            const wx = sx + (lx * cos) - (lz * sin);
            // Y position in World
            const wy = sy + (lx * sin) + (lz * cos);
            
            // Z position in World (Elevation)
            // Local 'y' is distance DOWN from top. 
            // So World Z = FloorElevation + WallHeight - ly
            // Actually simpler: FloorElevation is bottom of wall.
            // So World Z = FloorElevation + (WallHeight - ly) is tricky because member 'h' is also there.
            // Let's standardise: 
            // Member Y=0 is TOP of wall. 
            // Member Y=WallHeight is BOTTOM.
            // So Global Z = Elevation + (WallHeight - ly).
            // NOTE: Cuboids are drawn from Y to Y+H.
            // So a member at y=0 with height 1.5 is the top plate.
            // Its bottom is at y=1.5.
            // Global Z top = Elevation + WallHeight.
            // Global Z bottom = Elevation + WallHeight - 1.5.
            
            const wallHeight = wall.details.wallHeight;
            const wz = elevation + (wallHeight - ly); 

            return { x: wx, y: -wy, z: wz }; // Invert WY so standard 3D viewers match PDF orientation roughly
        };

        members.forEach(m => {
             // In transform, we need to handle the fact that PLY vertices are bare points.
             // The transformFn handles the corner logic.
             // However, for the Z calculation:
             // The transform function receives the corner's Ly.
             // If corner is top of member (ly=m.y), Z should be higher.
             // If corner is bottom of member (ly=m.y+h), Z should be lower.
             // My formula: wz = elevation + wallHeight - ly.
             // If ly gets bigger (lower in wall), wz gets smaller. Correct.
             addCuboid(m.x, m.y, m.z, m.w, m.h, m.d, m.type, transform);
        });
    });

    // Unpositioned Walls
    let unpositionedY = 0;
    if (positionedWalls.length > 0) {
        // Find bounds to place unpositioned walls nicely away
        // ... simplistic placement
        unpositionedY = -500; 
    }

    const unpositionedWalls = walls.filter(w => !w.pdfPosition);
    let currentX = 0;
    
    unpositionedWalls.forEach(wall => {
        const members = generateWallMembers(wall.details);
        
        const transform = (lx: number, ly: number, lz: number) => {
             const wx = currentX + lx;
             const wy = unpositionedY + lz; // Z maps to depth
             const wz = (wall.details.wallHeight - ly); // Just place on ground (z=0)
             return { x: wx, y: wy, z: wz };
        };

        members.forEach(m => {
            addCuboid(m.x, m.y, m.z, m.w, m.h, m.d, m.type, transform);
        });

        currentX += wall.details.wallLength + 48; // Spacing
    });

    // Header
    const header = [
        "ply",
        "format ascii 1.0",
        `element vertex ${vertexCount}`,
        "property float x",
        "property float y",
        "property float z",
        "property uchar red",
        "property uchar green",
        "property uchar blue",
        `element face ${faces.length}`,
        "property list uchar int vertex_index",
        "end_header"
    ].join('\n');

    return header + '\n' + vertices.join('\n') + '\n' + faces.join('\n');
};
