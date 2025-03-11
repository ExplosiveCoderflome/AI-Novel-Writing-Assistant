'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

// 定义代码组件的props类型
interface CodeProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("markdown-body w-full max-w-full", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold my-4 break-words" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-xl font-bold my-3 break-words" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-lg font-bold my-2 break-words" {...props} />,
          h4: ({ node, ...props }) => <h4 className="text-base font-bold my-2 break-words" {...props} />,
          h5: ({ node, ...props }) => <h5 className="text-sm font-bold my-1 break-words" {...props} />,
          h6: ({ node, ...props }) => <h6 className="text-xs font-bold my-1 break-words" {...props} />,
          p: ({ node, ...props }) => <p className="my-2 break-words" {...props} />,
          a: ({ node, ...props }) => <a className="text-blue-500 hover:underline break-words" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-6 my-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-6 my-2" {...props} />,
          li: ({ node, ...props }) => <li className="my-1 break-words" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-gray-300 pl-4 py-1 my-2 text-gray-700 dark:text-gray-300 break-words" {...props} />
          ),
          code: ({ node, inline, className, children, ...props }: CodeProps) => {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <div className="relative">
                <div className="absolute top-0 right-0 bg-gray-700 text-gray-200 px-2 py-0.5 text-xs rounded-bl">
                  {match[1]}
                </div>
                <pre className="mt-6 overflow-x-auto rounded-lg bg-gray-900 p-4 max-w-full">
                  <code className={className} style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            ) : (
              <code
                className={cn(
                  "rounded bg-gray-200 px-1 py-0.5 text-gray-900 dark:bg-gray-700 dark:text-gray-200 break-words",
                  className
                )}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ node, ...props }) => (
            <pre className="overflow-x-auto rounded-lg my-4 max-w-full" style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }} {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4 max-w-full">
              <table className="w-full divide-y divide-gray-300 dark:divide-gray-700 table-auto" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="bg-gray-100 dark:bg-gray-800" {...props} />,
          tbody: ({ node, ...props }) => <tbody className="divide-y divide-gray-200 dark:divide-gray-800" {...props} />,
          tr: ({ node, ...props }) => <tr className="hover:bg-gray-50 dark:hover:bg-gray-900" {...props} />,
          th: ({ node, ...props }) => (
            <th className="px-3 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 break-words" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 break-words" {...props} />
          ),
          hr: ({ node, ...props }) => <hr className="my-4 border-gray-300 dark:border-gray-700" {...props} />,
          img: ({ node, ...props }) => (
            <img className="max-w-full h-auto rounded-lg my-2" {...props} alt={props.alt || 'Image'} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer; 