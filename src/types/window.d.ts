interface Window {
  posthog?: {
    capture: (event: string, properties?: Record<string, any>) => void;
    identify: (distinctId: string, properties?: Record<string, any>) => void;
    init: (apiKey: string, config?: Record<string, any>) => void;
    opt_out_capturing: () => void;
    opt_in_capturing: () => void;
  };
}
