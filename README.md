# 3D Multiple Screens Setup

An interactive 3D workspace showing a grid plane and an ultrawide monitor model placed on the plane. Built with Three.js and React.

## Features

- 3D workspace with grid plane
- Orbit controls for camera navigation
- Lighting setup (ambient + directional)
# Virtual Lab

A Vite + React app with a 3D scene (three.js) and an interactive chart on an ultrawide monitor.

## Requirements
- Node.js 18+
- npm 9+

## Local development
```powershell
cd "C:\\New folder\\Virtual Lab"
npm install
npm run dev
```
Open http://localhost:5173

## Build
```powershell
cd "C:\\New folder\\Virtual Lab"
npm run build
```
Outputs to `dist/`.

## Deploy (Vercel)
This repo includes `vercel.json` for SPA routing.

- Preview:
```powershell
cd "C:\\New folder\\Virtual Lab"
vercel --yes
```
- Production:
```powershell
cd "C:\\New folder\\Virtual Lab"
vercel --prod --yes
```

Live site: https://virtual-9po63dg12-sujiths-projects-a37dec73.vercel.app

## Notes
- If you change routes, keep SPA fallback in `vercel.json`.
- The app relies on WebGL; use a modern browser with hardware acceleration.
- **Shadow Map Size**: 2048x2048
- **Background Color**: Light gray (#f0f0f0)

### Model

- File: `public/ultrawide_monitor.glb`
- Loaded via Three.js GLTFLoader and positioned so its base sits on the plane (y = 0), centered on X/Z.

## Controls

- **Mouse drag**: Rotate camera around the scene
- **Mouse wheel**: Zoom in/out
- **Right mouse drag**: Pan the camera

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Dependencies

- **React 18.2.0** - UI framework
- **Three.js 0.153.0** - 3D graphics library
- **Vite** - Build tool and development server
- **Tailwind CSS** - Utility-first CSS framework

## License

This project is private and for educational purposes.
