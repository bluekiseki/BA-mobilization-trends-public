import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark } from 'react-icons/hi2';
import { FaGithub } from 'react-icons/fa';
import { useLoaderData } from 'react-router';
import type { loader } from '~/root';

interface BugReportModalProps {
  onClose: () => void;
  issuesURL: string;
}

export default function BugReportModal({ onClose, issuesURL }: BugReportModalProps) {
  const { t } = useTranslation('common');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const data = useLoaderData<typeof loader>();
  
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('submitting');

    const form = e.currentTarget;
    const formData = new FormData(form);

    formData.append('access_key', (data?.env || import.meta.env).VITE_WEB3FORMS_ACCESS_KEY || 'YOUR_ACCESS_KEY_HERE');
    const typeLabel = formData.get('type') === 'bug' ? t('bugReport.typeBug') : t('bugReport.typeSuggestion');
    formData.append('subject', `[Feedback] ${typeLabel} - ${formData.get('title')}`);
    formData.append('from_name', 'Web Feedback Form');
    formData.append('URL', window.location.href);

    try {
      // const response = await fetch('/submit', {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setStatus('success');
        form.reset();
      } else {
        throw new Error('Submit failed');
      }
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/40 p-4 transition-opacity">
      <div className="bg-white dark:bg-neutral-900 w-full max-w-lg rounded-lg shadow-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-neutral-800 shrink-0">
          <h2 className="text-base font-semibold text-slate-800 dark:text-neutral-100">{t('bugReport.title')}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-800 dark:hover:text-neutral-200 transition-colors">
            <HiOutlineXMark className="text-xl" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {status === 'success' ? (
            <div className="text-center py-6">
              <h3 className="text-base font-semibold text-slate-800 dark:text-neutral-100 mb-2">{t('bugReport.successTitle')}</h3>
              <p className="text-slate-500 dark:text-neutral-400 text-sm mb-5">{t('bugReport.successDesc')}</p>
              <button onClick={onClose} className="px-5 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                {t('bugReport.close')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="flex gap-4 mb-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="type" value="bug" defaultChecked className="text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-slate-700 dark:text-neutral-300">{t('bugReport.typeBug')}</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="type" value="suggestion" className="text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-slate-700 dark:text-neutral-300">{t('bugReport.typeSuggestion')}</span>
                </label>
              </div>
              {/* Title input */}
              <div>
                <input
                  type="text"
                  name="title"
                  required
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                  placeholder={t('bugReport.inputTitle')}
                />
              </div>

              {/* Details input */}
              <div>
                <textarea
                  name="description"
                  required
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow resize-y"
                  placeholder={t('bugReport.inputDesc')}
                ></textarea>
              </div>

              {/* Email input */}
              <div>
                <input
                  type="email"
                  name="email"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-neutral-500 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                  placeholder={t('bugReport.inputEmail')}
                />
              </div>
              {/* File upload - This is a PRO feature */}
              {/* <div>
                <input
                  type="file"
                  name="attachment"
                  accept="image/png, image/jpeg"
                  className="block w-full text-sm text-slate-500 dark:text-neutral-400 file:mr-3 file:py-1.5 file:px-3 file:border-0 file:text-sm file:font-medium file:rounded-md file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 dark:file:bg-neutral-700 dark:file:text-neutral-200 dark:hover:file:bg-neutral-600 cursor-pointer transition-colors"
                />
              </div> */}

              {status === 'error' && <p className="text-red-500 text-xs mt-1">{t('bugReport.errorMsg')}</p>}

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="w-full py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 mt-1"
              >
                {status === 'submitting' ? t('bugReport.submittingBtn') : t('bugReport.submitBtn')}
              </button>

              <p className="text-center text-xs text-slate-400 dark:text-neutral-500 mt-1.5">{t('bugReport.poweredBy')}</p>
            </form>
          )}

          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-neutral-800">
            <a
              href={issuesURL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2 bg-slate-50 dark:bg-neutral-800/50 border border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-md text-sm font-medium transition-colors"
            >
              <FaGithub className="text-base" />
              {t('bugReport.githubIssue')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
