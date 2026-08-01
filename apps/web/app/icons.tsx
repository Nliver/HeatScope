import type { SVGProps } from 'react';
import { carbonIconData, type CarbonIconName } from './icon-data';

export type UiIconProps = Omit<SVGProps<SVGSVGElement>, 'height' | 'width'> & {
  size?: number | string;
  strokeWidth?: number;
};

function iconSize(size: UiIconProps['size']) {
  if (typeof size === 'number') return `${size}px`;
  return size || 'var(--icon-md)';
}

function carbonIcon(name: CarbonIconName) {
  const data = carbonIconData[name];

  return function LocalCarbonIcon({ size, strokeWidth: _strokeWidth, className = '', ...props }: UiIconProps) {
    const dimension = iconSize(size);
    const labelled = Boolean(props['aria-label'] || props['aria-labelledby']);

    return (
      <svg
        {...props}
        className={`ui-icon ${className}`.trim()}
        width={dimension}
        height={dimension}
        viewBox={`0 0 ${data.width} ${data.height}`}
        fill="none"
        aria-hidden={labelled ? undefined : true}
        focusable="false"
        dangerouslySetInnerHTML={{ __html: data.body }}
      />
    );
  };
}

export const ArrowUpDown = carbonIcon('arrows-vertical');
export const Check = carbonIcon('checkmark');
export const CheckmarkFilled = carbonIcon('checkmark-filled');
export const CircleAlert = carbonIcon('warning-alt');
export const CircleCheck = carbonIcon('checkmark-outline');
export const CircleDashed = carbonIcon('circle-dash');
export const Clock3 = carbonIcon('time');
export const Crosshair = carbonIcon('connect-target');
export const Download = carbonIcon('download');
export const FileSpreadsheet = carbonIcon('document');
export const ImagePlus = carbonIcon('image');
export const KeyRound = carbonIcon('credentials');
export const Layers3 = carbonIcon('layers');
export const ListFilter = carbonIcon('filter');
export const LoaderCircle = carbonIcon('renew');
export const LockKeyhole = carbonIcon('locked');
export const MousePointer2 = carbonIcon('cursor-1');
export const Pencil = carbonIcon('edit');
export const Plus = carbonIcon('add');
export const Save = carbonIcon('save');
export const Settings2 = carbonIcon('settings');
export const SlidersHorizontal = carbonIcon('settings-adjust');
export const Sparkles = carbonIcon('ai-status');
export const Square = carbonIcon('checkbox');
export const Wifi = carbonIcon('wifi');
export const X = carbonIcon('close');
export const ZoomIn = carbonIcon('zoom-in');
export const ZoomOut = carbonIcon('zoom-out');

export const BookOpen = carbonIcon('book');
export const ClipboardList = carbonIcon('task');
export const Menu = carbonIcon('menu');
export const PanelLeftClose = carbonIcon('side-panel-close');
export const PanelLeftOpen = carbonIcon('side-panel-open');
export const Target = carbonIcon('connect-target');
export const TrashCan = carbonIcon('trash-can');

export const AlertTriangle = carbonIcon('warning');
export const CheckCircle2 = carbonIcon('checkmark-outline');
export const RefreshCw = carbonIcon('renew');

export const ArrowLeft = carbonIcon('arrow-left');
export const ArrowRight = carbonIcon('arrow-right');
export const CopyPlus = carbonIcon('copy-file');
export const Database = carbonIcon('data-base');
export const ExternalLink = carbonIcon('launch');
export const FileCode2 = carbonIcon('code');
export const Fingerprint = carbonIcon('fingerprint-recognition');
export const ImageIcon = carbonIcon('image');
export const MousePointerClick = carbonIcon('cursor-1');
export const Eye = carbonIcon('view');
export const FileArchive = carbonIcon('archive');
export const RotateCcw = carbonIcon('reset');
