import devtoolsDetector from 'devtools-detector';
import { useEffect } from 'react';

let isDevtoolsDetectorInitialized = false;

export default function Devtoolsdetector() {
  useEffect(() => {
    if (!isDevtoolsDetectorInitialized) {
      devtoolsDetector.addListener((isOpen) => {
        if (isOpen) {
          if (isOpen) {
            window.open('', '_self');
            window.close();
          }
        }
      });
      devtoolsDetector.launch();
      isDevtoolsDetectorInitialized = true;
    }
  }, []);

  return null;
}
