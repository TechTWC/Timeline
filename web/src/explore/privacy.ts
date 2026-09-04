export class ExploreConsentError extends Error {
  constructor() {
    super('Explicit Explore external-service consent is required.');
    this.name = 'ExploreConsentError';
  }
}

export class ExploreExternalAccessGate {
  private consented = false;

  setConsent(consented: boolean): void {
    this.consented = consented;
  }

  canAccessExternalServices(): boolean {
    return this.consented;
  }

  requireConsent(): void {
    if (!this.consented) throw new ExploreConsentError();
  }
}
