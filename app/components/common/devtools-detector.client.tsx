import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { issuesURL } from '~/data/livedataServer.json';

// Printed at most once per page load.
let hasLoggedBanner = false;

// Rough ASCII rendering of the site name, shown alongside the info banner below.
const ASCII_LOGO = `
 __   __                 _____                   _
 \\ \\ / /   _ _____   _  |_   _| __ ___ _ __   __| |___
  \\ V / | | |_  / | | |   | || '__/ _ \\ '_ \\ / _\` / __|
   | || |_| |/ /| |_| |   | || | |  __/ | | | (_| \\__ \\
   |_| \\__,_/___|\\__,_|   |_||_|  \\___|_| |_|\\__,_|___/

`;

// Logged unconditionally rather than gated on detecting an open DevTools panel: the message
// just sits in the console buffer, so anyone who opens DevTools later still finds it, without
// a size-based open-detection heuristic that misfires on browser sidebars/split views.
export default function Devtoolsdetector() {
  const { t } = useTranslation('common');

  useEffect(() => {
    if (hasLoggedBanner) return;
    hasLoggedBanner = true;
    console.log(`%c${ASCII_LOGO}`, 'color:#77e0ff; font-family: monospace; white-space: pre;');
    console.log(`${t('devConsole.bugReportNotice', '')} ${issuesURL}`);
    console.log(t('devConsole.hostingNotice'));
    console.log(t('devConsole.analysisNotice'));
    console.log(t('devConsole.cdnUsageNotice'));
  }, [t]);

  return null;
}
