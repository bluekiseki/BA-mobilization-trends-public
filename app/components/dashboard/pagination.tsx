import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomNumberInput } from '../CustomInput';

export const Pagination: React.FC<{
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  showmoreBtn: boolean;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
  onLoadMore: () => void;
  onScrollToTop: () => void;
}> = ({ currentPage, totalItems, itemsPerPage, showmoreBtn, onPageChange, onItemsPerPageChange, onLoadMore, onScrollToTop }) => {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const { t: t_c } = useTranslation('common');
  const { t: t_ui } = useTranslation('ui');

  const [inputValue, setInputValue] = useState<string | number>(currentPage);

  useEffect(() => {
    setInputValue(currentPage);
  }, [currentPage]);

  if (totalItems <= itemsPerPage) return null;

  const handlePageSubmit = () => {
    const pageNum = Number(inputValue);
    if (pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum);
    } else {
      setInputValue(currentPage);
    }
  };

  const handleFormSubmit = (e: React.SubmitEvent) => {
    e.preventDefault();
    handlePageSubmit();
    e.target.querySelector('input')?.blur();
  };

  const buttonClasses =
    'flex items-center justify-center h-9 w-9 rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm';

  return (
    <div className={`my-5 flex flex-col sm:flex-${showmoreBtn ? 'row' : 'col'} items-center justify-between gap-4`}>
      {showmoreBtn && (
        <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          <span>{t_c('show_count')}</span>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="h-9 rounded-md border border-neutral-300 bg-white dark:bg-neutral-800 px-2 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-500 dark:border-neutral-700 transition"
          >
            {[10, 50, 100, 200].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center space-x-1">
        <button onClick={() => onPageChange(1)} disabled={currentPage === 1} className={buttonClasses} title={t_c('scroll_to_first_page')}>
          «
        </button>
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className={buttonClasses} title={t_c('scroll_to_prev_page')}>
          ‹
        </button>

        <div className="flex items-center text-sm text-neutral-600 dark:text-neutral-400 px-2">
          <form onSubmit={handleFormSubmit}>
            <CustomNumberInput
              // type="number"
              value={Number(inputValue)}
              onChange={(e) => setInputValue(Number(e))}
              onBlur={handlePageSubmit}
              className="w-18 h-9 rounded-md border border-neutral-300 bg-white dark:bg-neutral-800 text-center text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-500 dark:border-neutral-700 transition"
            />
          </form>
          <span className="px-2">/</span>
          <span>{totalPages}</span>
        </div>

        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className={buttonClasses} title={t_c('scroll_to_next_page')}>
          ›
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} className={buttonClasses} title={t_c('scroll_to_last_page')}>
          »
        </button>

        {showmoreBtn && (
          <button onClick={onScrollToTop} className={`${buttonClasses} ml-2`} title={t_c('scroll_to_top')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 2.707V14.5a.5.5 0 0 0 .5.5z" />
            </svg>
          </button>
        )}
      </div>

      {showmoreBtn && (
        <div className="w-full sm:w-auto">
          {currentPage < totalPages ? (
            <button
              onClick={onLoadMore}
              className="w-full h-9 px-4 flex items-center justify-center gap-2 text-sm font-medium rounded-md bg-neutral-800 text-white hover:bg-neutral-900 dark:bg-neutral-200 dark:text-neutral-800 dark:hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-500 dark:focus:ring-offset-neutral-900 transition-all shadow-sm"
            >
              <span>{t_ui('loadMore')}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path fillRule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L7.5 13.293V1.5A.5.5 0 0 1 8 1z" />
              </svg>
            </button>
          ) : (
            <div className="h-9"></div>
          )}
        </div>
      )}
    </div>
  );
};
