import type { FormVersionSnapshot } from '@portal/contracts';
import { ApiError } from '../../lib/api-client';
export interface Draft<T = FormVersionSnapshot> {
  revision: number;
  snapshot: T;
}
export interface DraftState<T = FormVersionSnapshot> extends Draft<T> {
  status: 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
  error?: unknown;
}
type Save<T> = (revision: number, snapshot: T) => Promise<Draft<T>>;
/** One writer per editor. A response acknowledges only the generation it actually saved. */
export class DraftSession<T = FormVersionSnapshot> {
  private state: DraftState<T>;
  private listeners = new Set<() => void>();
  private generation = 0;
  private savedGeneration = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<boolean>;
  private composing = false;
  private disposed = false;
  constructor(
    initial: Draft<T>,
    private readonly save: Save<T>,
  ) {
    this.state = { ...initial, status: 'saved' };
  }
  getSnapshot = () => this.state;
  connect() {
    this.disposed = false;
    this.schedule();
  }
  markConflict(error: unknown) {
    clearTimeout(this.timer);
    this.update({ status: 'conflict', error });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<DraftState<T>>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  edit(snapshot: T) {
    this.generation++;
    this.update({
      snapshot,
      status: ['error', 'conflict'].includes(this.state.status) ? this.state.status : 'dirty',
    });
    this.schedule();
  }
  setComposing(value: boolean) {
    this.composing = value;
    clearTimeout(this.timer);
    if (!value) this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    if (
      this.disposed ||
      this.composing ||
      this.running ||
      ['error', 'conflict'].includes(this.state.status) ||
      this.generation === this.savedGeneration
    )
      return;
    this.timer = setTimeout(() => {
      void this.flush();
    }, 700);
  }
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.disposed || this.composing || ['error', 'conflict'].includes(this.state.status))
      return false;
    if (this.running) {
      if (!(await this.running)) return false;
      return this.flush();
    }
    if (this.generation === this.savedGeneration) return true;
    const generation = this.generation;
    const { revision, snapshot } = this.state;
    this.update({ status: 'saving', error: undefined });
    this.running = (async () => {
      try {
        const result = await this.save(revision, snapshot);
        this.savedGeneration = generation;
        this.update({
          revision: result.revision,
          status: this.generation === generation ? 'saved' : 'dirty',
        });
        return true;
      } catch (error) {
        this.update({
          error,
          status: error instanceof ApiError && error.status === 409 ? 'conflict' : 'error',
        });
        return false;
      }
    })();
    const success = await this.running;
    this.running = undefined;
    if (success && this.generation !== this.savedGeneration) return this.flush();
    return success;
  }
  async retry() {
    if (this.state.status === 'conflict') return false;
    this.update({ status: 'dirty', error: undefined });
    return this.flush();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.listeners.clear();
  }
}
