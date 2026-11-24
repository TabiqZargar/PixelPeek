export interface Dimensions {
  width: number;
  height: number;
}

export interface ElementInfo {
  tag: string;
  id: string | null;
  classes: string[];
  dimensions: Dimensions;
  backgroundColor: string | null;
  color: string | null;
  fontFamily: string | null;
  fontSize: string | null;
  fontWeight: string | null;
  padding: string | null;
  margin: string | null;
  borderRadius: string | null;
  boxShadow: string | null;
  display: string | null;
  position: string | null;
  capturedAt: string;
  sourceUrl: string;
}

export interface InspectionState {
  tabId: number | null;
  active: boolean;
}

export const IDLE_STATE: InspectionState = { tabId: null, active: false };

export type InspectorStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'error';
