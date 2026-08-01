'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { TrashCan, X } from './icons';

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onOpenChange(open: boolean): void;
  onConfirm(): void;
};

export function ConfirmDialog({ open, title, description, confirmLabel, onOpenChange, onConfirm }: Props) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="history-reuse-overlay" />
      <Dialog.Content className="history-reuse-dialog confirm-dialog" aria-describedby="confirm-dialog-description">
        <header>
          <span><TrashCan size={18} /></span>
          <div><Dialog.Title>{title}</Dialog.Title><Dialog.Description id="confirm-dialog-description">{description}</Dialog.Description></div>
          <Dialog.Close asChild><button type="button" className="dialog-close" aria-label="关闭删除确认"><X size={17} /></button></Dialog.Close>
        </header>
        <div className="history-reuse-actions">
          <Dialog.Close asChild><button type="button" className="console-button">取消</button></Dialog.Close>
          <button type="button" className="console-button danger confirm-danger" onClick={() => { onConfirm(); onOpenChange(false); }}><TrashCan size={15} />{confirmLabel}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
