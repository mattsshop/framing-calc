
import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface PopOutWindowProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}

const PopOutWindow: React.FC<PopOutWindowProps> = ({ title, onClose, children }) => {
    const [container, setContainer] = useState<HTMLElement | null>(null);
    const newWindow = useRef<Window | null>(null);

    useEffect(() => {
        // Open new window
        const win = window.open('', '', 'width=1200,height=800,left=200,top=200');
        if (!win) {
            alert("Pop-up blocked! Please allow pop-ups for this site.");
            onClose();
            return;
        }
        newWindow.current = win;
        win.document.title = title;

        // Copy styles
        const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
        styles.forEach(style => {
            win.document.head.appendChild(style.cloneNode(true));
        });
        
        // Add dark mode/body classes from main app
        win.document.body.className = document.body.className;

        // Create container
        const div = win.document.createElement('div');
        div.style.height = '100%';
        div.className = 'h-full w-full';
        win.document.body.appendChild(div);
        setContainer(div);

        // Handle window close by user
        win.onbeforeunload = () => {
            onClose();
        };

        return () => {
            win.close();
        };
    }, []);

    if (!container) return null;

    return createPortal(children, container);
};

export default PopOutWindow;
