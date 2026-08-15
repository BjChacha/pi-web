import type { ReactiveController, ReactiveControllerHost } from "lit";
import { offLocaleChange, onLocaleChange } from "./index";

/**
 * Subscribes a Lit host to locale changes and requests a re-render, so
 * components rendering through t() stay in sync after setLocale().
 */
export class LocaleController implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private readonly handleChange = (): void => {
    this.host.requestUpdate();
  };

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected(): void {
    onLocaleChange(this.handleChange);
  }

  hostDisconnected(): void {
    offLocaleChange(this.handleChange);
  }
}
