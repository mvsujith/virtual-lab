import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import docContent from '../../NUBRA_PRODUCT_INTERNSHIP_SUBMISSION.md?raw';

export default function SubmissionDoc() {
  return (
    <div className="p-4 overflow-auto h-full prose prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{docContent}</ReactMarkdown>
    </div>
  );
}
