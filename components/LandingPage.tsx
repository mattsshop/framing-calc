import React from 'react';
import { ProjectIcon, GoogleIcon } from './Icons';

// Simple check icon for the feature list
const CheckIcon = () => (
    <svg className="w-5 h-5 text-green-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
);

interface LandingPageProps {
    onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
            <div className="max-w-4xl w-full grid md:grid-cols-2 gap-12 items-center">
                
                {/* Left Column: Copy */}
                <div className="space-y-8">
                    <div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-3 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/30">
                                <ProjectIcon className="w-8 h-8 text-white" />
                            </div>
                            <h1 className="text-3xl font-bold tracking-tight text-white">Framing Calculator Pro</h1>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 mb-6">
                            Build Smarter. <br/> Estimate Faster.
                        </h2>
                        <p className="text-lg text-slate-400 leading-relaxed">
                            The ultimate tool for carpenters and contractors. Calculate framing materials, generate cut lists, 
                            and visualize walls in 3D directly from your PDF plans.
                        </p>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center text-slate-300">
                            <CheckIcon />
                            <span>Import PDF Plans & Scale to Measure</span>
                        </div>
                        <div className="flex items-center text-slate-300">
                            <CheckIcon />
                            <span>Automated Cut Lists & Material Estimates</span>
                        </div>
                        <div className="flex items-center text-slate-300">
                            <CheckIcon />
                            <span>Instant 3D Visualization & SketchUp Export</span>
                        </div>
                        <div className="flex items-center text-slate-300">
                            <CheckIcon />
                            <span>AI-Powered Pro Tips & Optimization</span>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button 
                            onClick={onLogin} 
                            className="group relative inline-flex items-center justify-center gap-3 px-8 py-4 font-semibold text-white transition-all duration-200 bg-indigo-600 rounded-full hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 focus:ring-offset-slate-900"
                        >
                            <GoogleIcon className="w-6 h-6" />
                            <span className="text-lg">Sign in with Google</span>
                        </button>
                        <p className="mt-4 text-sm text-slate-500">
                            Secure authentication powered by Firebase.
                        </p>
                    </div>
                </div>

                {/* Right Column: Visual/Screenshot Placeholder */}
                <div className="hidden md:block relative">
                    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-2xl blur opacity-30 animate-pulse"></div>
                    <div className="relative bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl">
                        {/* Abstract UI Representation */}
                        <div className="space-y-4 opacity-90">
                            <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                                <div className="h-4 w-32 bg-slate-600 rounded"></div>
                                <div className="flex gap-2">
                                    <div className="h-8 w-8 bg-slate-700 rounded-full"></div>
                                    <div className="h-8 w-8 bg-indigo-600 rounded-full"></div>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2 space-y-3">
                                    <div className="h-32 bg-slate-700/50 rounded-lg border border-slate-600 border-dashed flex items-center justify-center">
                                        <span className="text-slate-500 text-sm">3D View</span>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="h-3 w-full bg-slate-700 rounded"></div>
                                        <div className="h-3 w-5/6 bg-slate-700 rounded"></div>
                                    </div>
                                </div>
                                <div className="col-span-1 space-y-2">
                                    <div className="h-4 w-full bg-slate-600 rounded mb-2"></div>
                                    <div className="h-2 w-full bg-slate-700 rounded"></div>
                                    <div className="h-2 w-full bg-slate-700 rounded"></div>
                                    <div className="h-2 w-full bg-slate-700 rounded"></div>
                                    <div className="h-2 w-full bg-slate-700 rounded"></div>
                                    <div className="mt-4 h-8 w-full bg-green-600/20 text-green-400 rounded flex items-center justify-center text-xs font-mono">
                                        Material List
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;