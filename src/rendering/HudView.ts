import type { GameState } from '../core/GameState';
import type { InteractionSystem } from '../systems/interaction/InteractionSystem';
import { villagerCount } from '../systems/Recruitment';
import { ECONOMY, KINGDOM } from '../config';
import { dailyFood } from '../systems/economy/FoodSystem';

const REFRESH_INTERVAL = 0.1;

const COIN_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="#e0a93a" stroke="#6e4a14"/><circle cx="8" cy="8" r="3.8" fill="none" stroke="#8d6420"/></svg>`;
const WOOD_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="4.5" width="11" height="7" rx="1.5" fill="#94683e" stroke="#4a3020"/><ellipse cx="12.5" cy="8" rx="2.6" ry="3.5" fill="#d3a56d" stroke="#4a3020"/></svg>`;
const PEOPLE_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4.6" r="3" fill="#d8b48a" stroke="#4a3020"/><path d="M2.8 14.5c0-3.6 2.3-5.6 5.2-5.6s5.2 2 5.2 5.6z" fill="#7d8f5c" stroke="#3d4628"/></svg>`;

/**
 * Coins, wood, villagers, day number and the interaction prompt, drawn in the DOM. It only
 * reads game state, and it writes to the DOM only when a value actually changes.
 */
export class HudView {
  private readonly root: HTMLElement;
  private readonly coins: HTMLElement;
  private readonly wood: HTMLElement;
  private readonly people: HTMLElement;
  private readonly food: HTMLElement;
  private readonly furs: HTMLElement;
  private readonly foodWarning: HTMLElement;
  private readonly request: HTMLElement;
  private readonly profession: HTMLButtonElement;
  private readonly day: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly feedback: HTMLElement;
  private readonly notice: HTMLElement;
  private sinceRefresh = REFRESH_INTERVAL;
  private shownCoins = NaN;
  private shownWood = NaN;
  private shownCapacity = NaN;
  private shownPeople = NaN;
  private shownDay = NaN;
  private shownPrompt = '';
  private shownFeedback = '';
  private shownNotice = '';
  private shownActionable = true;

  constructor(private readonly state: GameState, private readonly interaction: InteractionSystem, openProfessions: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="hud-status">
        <span class="hud-stat" data-stat="coins" title="Coins">${COIN_ICON}<b data-value="coins"></b></span>
        <span class="hud-stat" data-stat="wood" title="Stored wood">${WOOD_ICON}<b data-value="wood"></b></span>
        <span class="hud-stat" data-stat="food" title="Food: one per three villagers each day, rounded up"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15V2M8 6L4 3M8 9l4-3M8 12l-4-3" fill="none" stroke="#d4b45b" stroke-width="2"/></svg><b data-value="food"></b><span class="hud-label">food</span></span>
        <span class="hud-stat" data-stat="furs" title="Furs for trading"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2l5 2 5-2-1 6 1 6-5-2-5 2 1-6z" fill="#aa8057" stroke="#e3c499"/></svg><b data-value="furs"></b><span class="hud-label">furs</span></span>
        <span class="hud-stat" data-stat="people" title="Villagers">${PEOPLE_ICON}<b data-value="people"></b></span>
        <span class="hud-day" data-value="day"></span>
      </div>
      <div class="hud-notice" role="status" aria-live="polite"></div>
      <div class="hud-food-warning" role="status" aria-live="polite"></div>
      <div class="hud-request"></div>
      <div class="hud-action">
        <div class="hud-feedback" role="status" aria-live="polite"></div>
        <div class="hud-prompt"><kbd>E</kbd><span></span></div>
        <button class="save-button small" id="profession-button" hidden>Professions (R)</button>
      </div>`;
    document.body.appendChild(this.root);
    const find = (selector: string): HTMLElement => this.root.querySelector<HTMLElement>(selector)!;
    this.coins = find('[data-value="coins"]');
    this.wood = find('[data-value="wood"]');
    this.people = find('[data-value="people"]');
    this.food = find('[data-value="food"]');
    this.furs = find('[data-value="furs"]');
    this.foodWarning = find('.hud-food-warning');
    this.request = find('.hud-request');
    this.profession = find('#profession-button') as HTMLButtonElement;
    this.profession.onclick = openProfessions;
    this.day = find('[data-value="day"]');
    this.prompt = find('.hud-prompt');
    this.promptText = find('.hud-prompt span');
    this.feedback = find('.hud-feedback');
    this.notice = find('.hud-notice');
  }

  update(frameDt: number): void {
    this.sinceRefresh += frameDt;
    if (this.sinceRefresh < REFRESH_INTERVAL) return;
    this.sinceRefresh = 0;

    const { resources, time } = this.state;
    const food = String(resources.food), furs = String(resources.furs);
    if (this.food.textContent !== food) this.food.textContent = food;
    if (this.furs.textContent !== furs) this.furs.textContent = furs;
    const low = resources.food <= dailyFood(this.state) * ECONOMY.lowFoodDays;
    const warning = !low ? '' : resources.food === 0 ? `No food — production at ${Math.round(ECONOMY.shortageEfficiency * 100)}%. Assign a farmer or hunter.` : `Food low — ${resources.food} stored, ${dailyFood(this.state)} used per day.`;
    if (this.foodWarning.textContent !== warning) this.foodWarning.textContent = warning;
    this.foodWarning.hidden = !low;
    const request = this.state.kingdom.events.request === 'active' ? `Alda's request: bring ${KINGDOM.events.request.wood} wood for ${KINGDOM.events.request.coins} coins. Talk to Alda to deliver.` : '';
    if (this.request.textContent !== request) this.request.textContent = request;
    this.request.hidden = !request;
    const focusedNpc = this.state.npcs.find((n) => n.id === this.interaction.focus?.id && n.travelPhase === 'settled' && n.job !== 'gatherer');
    this.profession.hidden = !focusedNpc;
    if (focusedNpc) {
      const name = focusedNpc.assignedSite >= 0 ? 'Builder' : focusedNpc.job === 'villager' ? 'Unemployed' : focusedNpc.job;
      this.profession.textContent = `${focusedNpc.name}: ${name} · Professions (R)`;
    }
    if (resources.coins !== this.shownCoins) {
      this.coins.textContent = String(resources.coins);
      if (!Number.isNaN(this.shownCoins)) pulse(this.coins.parentElement!);
      this.shownCoins = resources.coins;
    }
    if (resources.wood !== this.shownWood || resources.woodCapacity !== this.shownCapacity) {
      this.wood.textContent = `${resources.wood}/${resources.woodCapacity}`;
      this.shownCapacity = resources.woodCapacity;
      if (!Number.isNaN(this.shownWood)) pulse(this.wood.parentElement!);
      this.shownWood = resources.wood;
    }
    const people = villagerCount(this.state.npcs);
    if (people !== this.shownPeople) {
      this.people.textContent = String(people);
      if (!Number.isNaN(this.shownPeople)) pulse(this.people.parentElement!);
      this.shownPeople = people;
    }
    if (time.day !== this.shownDay) {
      this.day.textContent = `Day ${time.day}`;
      this.shownDay = time.day;
    }

    const focus = this.interaction.focus;
    const promptText = focus ? focus.prompt() : '';
    if (promptText !== this.shownPrompt) {
      // Empty text keeps the previous words during the fade-out, rather than a blank box.
      if (promptText) this.promptText.textContent = promptText;
      this.prompt.classList.toggle('visible', promptText !== '');
      this.shownPrompt = promptText;
    }
    const actionable = focus?.isActionable?.() ?? true;
    if (actionable !== this.shownActionable) {
      this.prompt.classList.toggle('blocked', !actionable);
      this.shownActionable = actionable;
    }
    const notice = this.state.notice.text;
    if (notice !== this.shownNotice) {
      if (notice) this.notice.textContent = notice;
      this.notice.classList.toggle('visible', notice !== '');
      this.shownNotice = notice;
    }
    const feedback = this.interaction.feedback;
    if (feedback !== this.shownFeedback) {
      if (feedback) this.feedback.textContent = feedback;
      this.feedback.classList.toggle('visible', feedback !== '');
      this.shownFeedback = feedback;
    }
  }

  /** For HUD parts that manage themselves. */
  get element(): HTMLElement {
    return this.root;
  }

  dispose(): void {
    this.root.remove();
  }
}

function pulse(element: HTMLElement): void {
  element.classList.remove('pulse');
  void element.offsetWidth; // Restarts the CSS animation.
  element.classList.add('pulse');
}
