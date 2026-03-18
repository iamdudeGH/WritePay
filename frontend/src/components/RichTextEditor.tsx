"use client"

import { useRef, useCallback, useEffect, useState } from 'react';
import {
    Bold, Italic, Underline, Heading1, Heading2,
    List, ListOrdered, Quote, Link2, ImagePlus,
    Undo2, Redo2, Minus, AlignLeft, AlignCenter, AlignRight,
    Code
} from 'lucide-react';

interface RichTextEditorProps {
    content: string;
    onChange: (html: string) => void;
    onSave?: () => void;
    placeholder?: string;
}

// ── Toolbar Button ──────────────────────────────────────────────
function ToolbarButton({
    icon: Icon,
    label,
    onClick,
    active = false,
}: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            onMouseDown={(e) => {
                e.preventDefault(); // Prevent losing selection
                onClick();
            }}
            title={label}
            className={`p-2 rounded-lg transition-all duration-150 cursor-pointer ${active
                ? 'bg-blue-500/20 text-blue-400 shadow-inner border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/10 border border-transparent'
                }`}
        >
            <Icon size={16} />
        </button>
    );
}

function Separator() {
    return <div className="w-px h-6 bg-slate-700/60 mx-1 shrink-0" />;
}

// ── Main Editor ─────────────────────────────────────────────────
export default function RichTextEditor({
    content,
    onChange,
    onSave,
    placeholder = "Start writing your masterpiece here...",
}: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    // ── Active formatting state ──
    const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});

    // ── Probe the browser for which formats are currently active ──
    const updateActiveFormats = useCallback(() => {
        const formats: Record<string, boolean> = {
            bold: document.queryCommandState('bold'),
            italic: document.queryCommandState('italic'),
            underline: document.queryCommandState('underline'),
            insertUnorderedList: document.queryCommandState('insertUnorderedList'),
            insertOrderedList: document.queryCommandState('insertOrderedList'),
            justifyLeft: document.queryCommandState('justifyLeft'),
            justifyCenter: document.queryCommandState('justifyCenter'),
            justifyRight: document.queryCommandState('justifyRight'),
        };

        // Detect current block type for heading / blockquote highlights
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            let node: Node | null = sel.anchorNode;
            formats.h1 = false;
            formats.h2 = false;
            formats.blockquote = false;
            while (node && node !== editorRef.current) {
                const tag = (node as HTMLElement).tagName;
                if (tag === 'H1') formats.h1 = true;
                if (tag === 'H2') formats.h2 = true;
                if (tag === 'BLOCKQUOTE') formats.blockquote = true;
                node = node.parentNode;
            }
        }

        setActiveFormats(formats);
    }, []);

    // ── Listen for selection / cursor changes to keep toolbar in sync ──
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        editor.addEventListener('keyup', updateActiveFormats);
        editor.addEventListener('mouseup', updateActiveFormats);
        document.addEventListener('selectionchange', updateActiveFormats);

        return () => {
            editor.removeEventListener('keyup', updateActiveFormats);
            editor.removeEventListener('mouseup', updateActiveFormats);
            document.removeEventListener('selectionchange', updateActiveFormats);
        };
    }, [updateActiveFormats]);

    // ── Sync content into the div on first mount only ──
    useEffect(() => {
        if (editorRef.current && content && editorRef.current.innerHTML !== content) {
            editorRef.current.innerHTML = content;
            setIsEmpty(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Emit the current HTML upward ──
    const emitChange = useCallback(() => {
        if (editorRef.current) {
            const html = editorRef.current.innerHTML;
            const text = editorRef.current.innerText.trim();
            setIsEmpty(text.length === 0 || html === '<br>');
            onChange(html);
        }
    }, [onChange]);

    // ── Execute formatting commands (toggles automatically via execCommand) ──
    const exec = useCallback((command: string, value?: string) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
        emitChange();
        // Immediately refresh active state after executing
        setTimeout(updateActiveFormats, 0);
    }, [updateActiveFormats, emitChange]);

    // ── Paste handler: strip all HTML, paste plain text ──
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    }, []);

    // ── Keyboard shortcuts ──
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key === 's') {
            e.preventDefault();
            onSave?.();
        }
        if (mod && e.key === 'b') { e.preventDefault(); exec('bold'); }
        if (mod && e.key === 'i') { e.preventDefault(); exec('italic'); }
        if (mod && e.key === 'u') { e.preventDefault(); exec('underline'); }
    }, [exec, onSave]);

    // ── Insert heading via formatBlock, then auto-insert a new paragraph below ──
    const insertHeading = useCallback((level: 'H1' | 'H2') => {
        // If we're already inside this heading level, toggle back to paragraph
        if ((level === 'H1' && activeFormats.h1) || (level === 'H2' && activeFormats.h2)) {
            document.execCommand('formatBlock', false, 'P');
            editorRef.current?.focus();
            emitChange();
            setTimeout(updateActiveFormats, 0);
            return;
        }

        document.execCommand('formatBlock', false, level);

        // After creating the heading, insert a new empty <p> below and move cursor into it
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            let headingNode: HTMLElement | null = sel.anchorNode as HTMLElement;
            // Walk up to find the actual heading element
            while (headingNode && headingNode !== editorRef.current && headingNode.tagName !== level) {
                headingNode = headingNode.parentElement;
            }
            if (headingNode && headingNode.tagName === level) {
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                headingNode.insertAdjacentElement('afterend', p);
                // Move cursor into the new paragraph
                const range = document.createRange();
                range.setStart(p, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
        emitChange();
        setTimeout(updateActiveFormats, 0);
    }, [activeFormats, emitChange, updateActiveFormats]);

    // ── Insert link ──
    const insertLink = () => {
        const url = prompt('Enter the URL:');
        if (url) exec('createLink', url);
    };

    // ── Insert image via FileReader with Compression ──
    const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Optimization: Compress image to avoid massive base64 strings
        // This helps prevent "Failed to complete multipart upload" errors in Shelby
        const reader = new FileReader();
        reader.onload = (ev) => {
            const tempImg = new Image();
            tempImg.src = ev.target?.result as string;
            tempImg.onload = () => {
                const canvas = document.createElement('canvas');
                let width = tempImg.width;
                let height = tempImg.height;
                const MAX_WIDTH = 1600;

                if (width > MAX_WIDTH) {
                    height = Math.round((MAX_WIDTH / width) * height);
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(tempImg, 0, 0, width, height);
                    // Use JPEG with 0.8 quality for significant size reduction
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                    
                    editorRef.current?.focus();
                    document.execCommand(
                        'insertHTML',
                        false,
                        `<img src="${compressedBase64}" alt="uploaded" style="max-width:100%;border-radius:0.75rem;margin:1rem 0;" />`
                    );
                    emitChange();
                }
            };
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // reset so same file can be re-uploaded
    }, [emitChange]);

    // ── Insert horizontal rule ──
    const insertHR = () => exec('insertHorizontalRule');

    // ── Toggle blockquote ──
    const insertQuote = useCallback(() => {
        if (activeFormats.blockquote) {
            // Already in a blockquote — toggle back to paragraph
            document.execCommand('formatBlock', false, 'P');
        } else {
            document.execCommand('formatBlock', false, 'BLOCKQUOTE');
        }
        editorRef.current?.focus();
        emitChange();
        setTimeout(updateActiveFormats, 0);
    }, [activeFormats, emitChange, updateActiveFormats]);

    // ── Insert code block ──
    const insertCode = () => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const code = document.createElement('pre');
            code.style.cssText = 'background:#1e293b;color:#e2e8f0;padding:1rem;border-radius:0.5rem;overflow-x:auto;font-family:monospace;margin:0.75rem 0;';
            code.textContent = range.toString() || 'code here...';
            range.deleteContents();
            range.insertNode(code);
            emitChange();
        }
    };

    return (
        <div className="rich-editor-container border border-white/10 bg-black/40 rounded-2xl overflow-hidden backdrop-blur-sm">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-3 bg-white/5 border-b border-white/10 sticky top-0 z-10 backdrop-blur-md">
                <ToolbarButton icon={Undo2} label="Undo" onClick={() => exec('undo')} />
                <ToolbarButton icon={Redo2} label="Redo" onClick={() => exec('redo')} />
                <Separator />
                <ToolbarButton icon={Heading1} label="Heading 1" onClick={() => insertHeading('H1')} active={!!activeFormats.h1} />
                <ToolbarButton icon={Heading2} label="Heading 2" onClick={() => insertHeading('H2')} active={!!activeFormats.h2} />
                <Separator />
                <ToolbarButton icon={Bold} label="Bold (Ctrl+B)" onClick={() => exec('bold')} active={!!activeFormats.bold} />
                <ToolbarButton icon={Italic} label="Italic (Ctrl+I)" onClick={() => exec('italic')} active={!!activeFormats.italic} />
                <ToolbarButton icon={Underline} label="Underline (Ctrl+U)" onClick={() => exec('underline')} active={!!activeFormats.underline} />
                <Separator />
                <ToolbarButton icon={List} label="Bullet List" onClick={() => exec('insertUnorderedList')} active={!!activeFormats.insertUnorderedList} />
                <ToolbarButton icon={ListOrdered} label="Numbered List" onClick={() => exec('insertOrderedList')} active={!!activeFormats.insertOrderedList} />
                <ToolbarButton icon={Quote} label="Blockquote" onClick={insertQuote} active={!!activeFormats.blockquote} />
                <Separator />
                <ToolbarButton icon={AlignLeft} label="Align Left" onClick={() => exec('justifyLeft')} active={!!activeFormats.justifyLeft} />
                <ToolbarButton icon={AlignCenter} label="Align Center" onClick={() => exec('justifyCenter')} active={!!activeFormats.justifyCenter} />
                <ToolbarButton icon={AlignRight} label="Align Right" onClick={() => exec('justifyRight')} active={!!activeFormats.justifyRight} />
                <Separator />
                <ToolbarButton icon={Link2} label="Insert Link" onClick={insertLink} />
                <ToolbarButton icon={ImagePlus} label="Insert Image" onClick={() => fileInputRef.current?.click()} />
                <ToolbarButton icon={Minus} label="Horizontal Rule" onClick={insertHR} />
                <ToolbarButton icon={Code} label="Code Block" onClick={insertCode} />

                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                />
            </div>

            {/* Editor Body */}
            <div className="relative bg-transparent">
                {isEmpty && (
                    <div className="absolute top-0 left-0 right-0 p-8 pointer-events-none text-white/5 text-xl font-bold uppercase tracking-[0.2em]">
                        {placeholder}
                    </div>
                )}
                <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={emitChange}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (editorRef.current && (editorRef.current.innerHTML === '' || editorRef.current.innerHTML === '<br>')) {
                            editorRef.current.innerHTML = '<p><br></p>';
                            const sel = window.getSelection();
                            const range = document.createRange();
                            range.setStart(editorRef.current.firstChild!, 0);
                            range.collapse(true);
                            sel?.removeAllRanges();
                            sel?.addRange(range);
                        }
                    }}
                    className="min-h-[500px] p-8 outline-none text-lg leading-relaxed text-white/70 font-medium prose prose-invert max-w-none
            [&_p]:mb-6
            [&_h1]:text-4xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:tracking-tight [&_h1]:mt-12 [&_h1]:mb-6
            [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:tracking-tight [&_h2]:mt-10 [&_h2]:mb-4
            [&_blockquote]:border-l-2 [&_blockquote]:border-[#00ffff] [&_blockquote]:pl-8 [&_blockquote]:text-white/40 [&_blockquote]:italic [&_blockquote]:text-lg [&_blockquote]:my-10 [&_blockquote]:bg-white/5 [&_blockquote]:py-6 [&_blockquote]:rounded-r-xl
            [&_ul]:list-disc [&_ul]:pl-8 [&_ul]:my-6
            [&_ol]:list-decimal [&_ol]:pl-8 [&_ol]:my-6
            [&_li]:my-2
            [&_a]:text-[#00ffff] [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-1 hover:[&_a]:text-white
            [&_hr]:border-0 [&_hr]:h-px [&_hr]:bg-white/10 [&_hr]:my-12
            [&_img]:border border-white/10 [&_img]:rounded-2xl [&_img]:shadow-2xl [&_img]:my-10
            [&_pre]:bg-black/50 [&_pre]:text-[#00ffff] [&_pre]:p-8 [&_pre]:border border-white/10 [&_pre]:rounded-2xl [&_pre]:my-10 [&_pre]:font-mono [&_pre]:text-sm [&_pre]:overflow-x-auto
          "
                />
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between px-6 py-3 bg-white/5 border-t border-white/10">
                <span className="text-[9px] text-white/10 font-bold uppercase tracking-[0.3em]">
                    Secured Shelby Editor
                </span>
            </div>
        </div>
    );
}
