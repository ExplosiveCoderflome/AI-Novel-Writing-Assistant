'use client';

import dynamic from 'next/dynamic';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

const MDEditor = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default),
  { ssr: false }
);

interface MarkdownEditorProps {
  value: string;
  onChange: (value?: string | React.SetStateAction<string>) => void;
  preview?: 'live' | 'edit' | 'preview';
  height?: number;
  minHeight?: string;
  placeholder?: string;
  className?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  preview = 'live',
  height = 400,
  minHeight,
  placeholder = '请输入内容...',
  className = '',
}: MarkdownEditorProps) {
  const style = minHeight ? { minHeight } : undefined;
  
  return (
    <div className={`w-full ${className}`} data-color-mode="light" style={style}>
      <MDEditor
        value={value}
        onChange={onChange}
        preview={preview}
        height={height}
        hideToolbar={false}
        enableScroll={true}
        textareaProps={{
          placeholder,
        }}
      />
    </div>
  );
} 