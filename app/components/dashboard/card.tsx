import { useState } from 'react';
import { ChevronIcon } from '../Icon';

export const Card: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
  defaultExpanded?: boolean;
  headerActions?: React.ReactNode;
  height?: string;
  icon?: React.ReactNode;
}> = ({ title, children, className = '', defaultExpanded = true, headerActions, height = 'min-h-[300px]', icon }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleToggle = () => {
    setIsExpanded((prevState) => !prevState);
  };

  return (
    <div className={`bg-neutral-50 dark:bg-neutral-900 pb-10 ${className}`}>
      <div
        // type="button"
        onClick={handleToggle}
        className="flex items-center justify-between text-left p-1 mx-2.5 border-b border-neutral-400 dark:border-neutral-700 cursor-pointer"
        aria-expanded={isExpanded}
        aria-controls="card-content"
      >
        <h2 className="flex items-center gap-x-2 justify-center text-lg font-semibold text-gray-800 dark:text-gray-100">
          <span>{icon ? icon : ''}</span>
          <span>{title}</span>
        </h2>
        <div className="flex items-center gap-4">
          {headerActions && <div onClick={(e) => e.stopPropagation()}>{headerActions}</div>}
          <ChevronIcon className={isExpanded ? 'rotate-180' : ''} />
        </div>
      </div>

      {isExpanded && (
        <div id="card-content" className={`transition-all duration-300 ease-in-out ${height ? height : ''}`}>
          <hr className="hidden  mx-4 border-t border-gray-200 dark:border-neutral-700" />

          <div className={`p-4 pt-4  dark:bg-neutral-900 `}>{children}</div>
        </div>
      )}
    </div>
  );
};
