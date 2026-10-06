import React, { useState } from 'react';

interface SmartImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  placeholderClassName?: string;
}

export const SmartImage: React.FC<SmartImageProps> = ({ className, placeholderClassName, src, alt, ...props }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Loading Skeleton */}
      {!isLoaded && !error && (
        <div className={`absolute inset-0 bg-slate-50 animate-pulse flex items-center justify-center ${placeholderClassName}`}>
           <svg className="w-8 h-8 text-slate-300 animate-spin" fill="none" viewBox="0 0 24 24">
             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
           </svg>
        </div>
      )}
      
      {/* Actual Image */}
      <img 
        src={src} 
        alt={alt}
        className={`w-full h-full object-cover transition-all duration-700 ease-in-out ${isLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
        onLoad={() => setIsLoaded(true)}
        onError={() => setError(true)}
        {...props}
      />

      {/* Error State */}
      {error && (
         <div className="absolute inset-0 bg-slate-50 flex items-center justify-center text-slate-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
         </div>
      )}
    </div>
  );
};