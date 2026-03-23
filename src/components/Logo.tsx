import React from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
    className?: string;
    iconOnly?: boolean;
    showText?: boolean;
    dark?: boolean;
}

const Logo: React.FC<LogoProps> = ({
    className,
    iconOnly = false,
    showText = true,
    dark = true
}) => {
    return (
        <div className={cn("flex items-center gap-3", className)}>
            <div className={cn(
                "flex items-center justify-center shrink-0",
                iconOnly ? "h-[4.2rem] md:h-[5.6rem]" : "h-[4.9rem] md:h-[6.3rem]"
            )}>
                <img
                    src={dark ? "/vult-intel-logo-dark.png" : "/vult-intel-logo-light.png"}
                    alt="Vult Intel Logo"
                    className="h-full w-auto object-contain"
                    onError={(e) => {
                        // Fallback logic
                        const target = e.target as HTMLImageElement;
                        target.src = "/logo.png"; // Fallback to old placeholder if exists
                        target.onerror = null; // Prevent infinite loop
                    }}
                />
            </div>
            {/* We keep the text logic as well in case the user wants a more modular approach or if the image is just the icon */}
            {/* But based on the provided logo, it contains the text. If iconOnly is true, we might want to hide the rest via CSS if possible, but let's see. */}
            {!iconOnly && showText && (
                <div className="hidden"> {/* Set to hidden if the logo image already includes text */}
                    <div className="flex flex-col">
                        <span className={cn(
                            "font-black tracking-tighter leading-none",
                            dark ? "text-white" : "text-slate-900",
                            "text-base md:text-lg"
                        )}>
                            VULT INTEL
                        </span>
                        <p className={cn(
                            "text-[10px] md:text-[11px] font-medium mt-0.5 uppercase tracking-wider",
                            dark ? "text-slate-400" : "text-slate-500"
                        )}>
                            Marketing Platform
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Logo;
