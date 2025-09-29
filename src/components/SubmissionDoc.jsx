import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import docContent from '../../NUBRA_PRODUCT_INTERNSHIP_SUBMISSION.md?raw';

export default function SubmissionDoc({ onClose }) {
  return (
    <div className="h-full overflow-auto bg-gray-900">
      <div className="sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-gray-900/70 bg-gray-900/90 border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-300">Nubra Product Intern — Submission</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white border border-white/10 shadow-sm"
            title="Close document"
          >
            Close
          </button>
        </div>
      </div>
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="rounded-lg border border-gray-800 bg-gray-950 shadow-lg">
          <article className="prose prose-invert lg:prose-lg max-w-none px-6 py-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
          </article>
        </div>
      </main>
    </div>
  );
}
