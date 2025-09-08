'use client'
import { addListener, launch } from 'devtools-detector';
import { useEffect } from 'react';

addListener((isOpen) => {
    if (isOpen) {
        window.open("", "_self");
        window.close();
    }
});

export default function Devtoolsdetector() {
    useEffect(() => {
        console.log('launch', launch);
        if (process.env.NODE_ENV != 'development') {
            launch();
        }
    }, [launch]);

    return null;
}
