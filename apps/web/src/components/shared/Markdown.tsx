import React from 'react';

interface MarkdownProps {
  children: string;
}

export function Markdown({ children }: MarkdownProps) {
  const render = (text: string): React.ReactNode => {
    let result = text;

    // 先处理代码块，避免其他正则破坏代码
    const codeBlockRegex = /```([\s\S]*?)```/g;
    const codeBlocks: string[] = [];
    result = result.replace(codeBlockRegex, (match, code) => {
      codeBlocks.push(code);
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    // 处理加粗 **text**
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 处理斜体 *text*
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 处理代码 `code`
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 处理标题 # Header
    result = result.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, content) => {
      const level = hashes.length;
      const fontSize = 18 - level * 2;
      return `<h${level} style="margin-top: 12px; margin-bottom: 8px; font-size: ${fontSize}px; font-weight: 600; color: var(--color-text-primary)">${content}</h${level}>`;
    });

    // 处理列表 - item
    result = result.replace(/^\s*[-*+]\s+(.+)$/gm, (_, item) => {
      return `<li style="margin-left: 16px; margin-bottom: 4px; color: var(--color-text-primary)">${item}</li>`;
    });

    // 处理换行
    result = result.replace(/\n\n/g, '</p><p style="margin-bottom: 12px">');
    result = `<p style="margin-bottom: 12px">${result}</p>`;

    // 处理单个换行
    result = result.replace(/\n/g, '<br />');

    // 把代码块放回去
    for (let i = 0; i < codeBlocks.length; i++) {
      const code = codeBlocks[i]
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      result = result.replace(
        `__CODE_BLOCK_${i}__`,
        `<pre style="padding: 12px; background: var(--color-surface-hover); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: 13px; overflow-x: auto; color: var(--color-text-primary); margin-bottom: 12px;"><code>${code}</code></pre>`
      );
    }

    return (
      <div
        style={{
          color: 'var(--color-text-primary)',
          fontSize: '14px',
          lineHeight: '1.7',
        }}
        dangerouslySetInnerHTML={{ __html: result }}
      />
    );
  };

  return render(children);
}
