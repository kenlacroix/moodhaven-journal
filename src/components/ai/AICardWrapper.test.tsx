import { render, screen } from '@testing-library/react';
import { AICardWrapper, deriveAISource } from './AICardWrapper';

describe('AICardWrapper', () => {
  it('D3-1: renders "Generated locally" aria-label when source=local', () => {
    render(
      <AICardWrapper source="local">
        <div>content</div>
      </AICardWrapper>,
    );
    expect(screen.getByLabelText('Generated locally')).toBeInTheDocument();
  });

  it('D3-2: renders "Running in cloud mode" aria-label when source=cloud', () => {
    render(
      <AICardWrapper source="cloud">
        <div>content</div>
      </AICardWrapper>,
    );
    expect(screen.getByLabelText('Running in cloud mode')).toBeInTheDocument();
  });

  it('D3-3: renders "Ollama offline" badge when source=ollama-offline', () => {
    render(
      <AICardWrapper source="ollama-offline">
        <div>content</div>
      </AICardWrapper>,
    );
    expect(screen.getByLabelText('Ollama offline')).toBeInTheDocument();
  });

  it('D3-4: no badge rendered when source=disabled', () => {
    render(
      <AICardWrapper source="disabled">
        <div>content</div>
      </AICardWrapper>,
    );
    expect(screen.queryByLabelText('Generated locally')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Running in cloud mode')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ollama offline')).not.toBeInTheDocument();
  });
});

describe('deriveAISource', () => {
  it('returns disabled when AI not enabled', () => {
    expect(deriveAISource(false, null, true, true)).toBe('disabled');
  });

  it('returns cloud when apiKeySource is user', () => {
    expect(deriveAISource(true, 'user', false, false)).toBe('cloud');
  });

  it('returns local when Ollama enabled and online, no cloud key', () => {
    expect(deriveAISource(true, null, true, true)).toBe('local');
  });

  it('returns ollama-offline when Ollama configured but offline', () => {
    expect(deriveAISource(true, null, true, false)).toBe('ollama-offline');
  });
});
