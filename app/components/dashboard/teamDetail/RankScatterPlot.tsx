import { useEffect, useRef } from "react";
import { useIsDarkState } from "~/store/isDarkState";

export const RankScatterPlot: React.FC<{ ranks: number[], start_rank: number, max_rank: number }> = ({ ranks, start_rank, max_rank }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const MAX_RANK = max_rank;
    const START_RANK = start_rank;

    const { isDark } = useIsDarkState();

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#e5e7eb'; // neutral-200
        if (isDark == 'dark') {
            ctx.fillStyle = '#404040'; // neutral-700
        }
        const axisY = rect.height / 2;
        ctx.fillRect(0, axisY - 1.5, rect.width, 3);

        // const opty = 0.05
        const opty = 0.7 - Math.min(0.65, Math.max(0, Math.log(MAX_RANK / 500) / 5))
        ctx.fillStyle = `rgba(14, 165, 233, ${opty})`; // bg-sky-500/70
        if (document.documentElement.classList.contains('dark')) {
            // ctx.fillStyle = `rgba(56, 189, 248, ${`; // dark:bg-sky-400/70
            ctx.fillStyle = `rgba(56, 189, 248, ${opty})`; // dark:bg-sky-400/70
        }

        ranks.forEach(rank => {
            const x = ((rank - START_RANK) / MAX_RANK) * rect.width;
            ctx.beginPath();
            ctx.arc(x, axisY, 2, 0, 2 * Math.PI);
            ctx.fill();
        });

    }, [ranks, isDark]);

    const title = `${ranks.length.toLocaleString()} data points`;

    return (
        <div className="relative w-full h-4" title={title}>
            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full"
            />
        </div>
    );
};