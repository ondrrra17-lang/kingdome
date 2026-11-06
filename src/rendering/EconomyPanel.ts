import { KINGDOM } from '../config';
import type { GameState } from '../core/GameState';
import type { NpcState } from '../entities/Npc';
import { assignProfession, professionProblem, PROFESSIONS, type Profession } from '../systems/economy/Professions';
import { trade } from '../systems/economy/MerchantSystem';

const jobName = (job: string): string => job === 'villager' ? 'Unemployed' : job.charAt(0).toUpperCase() + job.slice(1);

/** A small nonmodal context panel. The world keeps running while choosing a job or trade. */
export class EconomyPanel {
  private readonly root = document.createElement('aside');
  private readonly title = document.createElement('h2');
  private readonly description = document.createElement('p');
  private readonly actions = document.createElement('div');
  private readonly result = document.createElement('p');
  private npc: NpcState | null = null;
  private merchantMode = false;
  private refreshIn = 0;
  private previousFocus: HTMLElement | null = null;
  private readonly closeButton = document.createElement('button');
  constructor(private readonly state: GameState, private readonly releaseInput: () => void) {
    this.root.id = 'economy-panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-labelledby', 'economy-title');
    this.title.id = 'economy-title';
    this.closeButton.className = 'save-button small';
    this.closeButton.textContent = 'Close (Esc)';
    this.closeButton.onclick = () => this.close();
    this.result.className = 'economy-result';
    this.result.setAttribute('role', 'status');
    this.result.setAttribute('aria-live', 'polite');
    this.root.append(this.title, this.description, this.actions, this.result, this.closeButton);
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.onKey);
  }
  showProfessions(npc: NpcState): void {
    this.npc = npc; this.merchantMode = false;
    this.title.textContent = `${npc.name}'s profession`;
    this.actions.replaceChildren();
    for (const job of PROFESSIONS) {
      const button = this.button(jobName(job), () => {
        const error = assignProfession(this.state, npc, job);
        this.result.textContent = error ?? `${npc.name} is now ${job === 'villager' ? 'unemployed' : `a ${job}`}. No coins charged.`;
        this.refresh();
      });
      button.dataset.job = job;
    }
    this.open();
  }
  showTrading(): void {
    this.npc = null; this.merchantMode = true;
    this.title.textContent = "Rowan's market";
    this.description.textContent = 'Trade village supplies. Each click makes one exchange.';
    this.actions.replaceChildren();
    for (const offer of KINGDOM.trades) {
      const button = this.button(offer.label, () => {
        this.result.textContent = trade(this.state, offer.id);
        this.refresh();
      });
      button.dataset.trade = offer.id;
    }
    this.open();
  }
  private button(label: string, run: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'save-button'; button.textContent = label;
    button.addEventListener('click', run);
    this.actions.appendChild(button);
    return button;
  }
  private open(): void {
    if (this.root.hidden) this.previousFocus = document.activeElement as HTMLElement | null;
    this.releaseInput(); this.result.textContent = '';
    this.root.hidden = false; this.refresh();
    this.closeButton.focus({ preventScroll: true });
  }
  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.releaseInput();
    this.previousFocus?.focus({ preventScroll: true });
  }
  update(dt: number): void {
    if (this.root.hidden) return;
    this.refreshIn -= dt;
    if (this.refreshIn > 0) return;
    this.refreshIn = 0.15;
    const source = this.npc ?? this.state.kingdom.merchant;
    if (Math.hypot(source.x - this.state.player.x, source.z - this.state.player.z) > 5
      || (this.merchantMode && this.state.kingdom.merchant.phase !== 'visiting') || this.npc?.indoors) this.close();
    else this.refresh();
  }
  private refresh(): void {
    if (this.npc) {
      this.description.textContent = `Current: ${this.npc.assignedSite >= 0 ? 'Builder' : jobName(this.npc.job)}. Professions are free; workplaces must be built and available.`;
      for (const button of this.actions.querySelectorAll<HTMLButtonElement>('button')) {
        const job = button.dataset.job as Profession;
        const problem = professionProblem(this.state, this.npc, job);
        button.disabled = !!problem || this.npc.job === job;
        button.title = problem ?? (this.npc.job === job ? 'Already assigned' : 'Assign this profession');
        button.textContent = `${jobName(job)}${this.npc.job === job ? ' — current' : problem ? ` — ${problem}` : ''}`;
      }
    } else {
      for (const button of this.actions.querySelectorAll<HTMLButtonElement>('button')) {
        const offer = KINGDOM.trades.find((t) => t.id === button.dataset.trade)!;
        const enough = Object.entries(offer.cost).every(([key, amount]) => this.state.resources[key as 'coins' | 'wood' | 'furs'] >= amount);
        button.disabled = !enough || this.state.kingdom.merchant.phase !== 'visiting';
        button.title = enough ? offer.label : 'Not enough resources';
      }
    }
  }
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && !this.root.hidden) { event.preventDefault(); this.close(); }
  };
  dispose(): void { window.removeEventListener('keydown', this.onKey); this.root.remove(); }
}
