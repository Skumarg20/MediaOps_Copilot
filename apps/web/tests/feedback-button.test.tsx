import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackButtons } from '@/components/FeedbackButtons';
import * as api from '@/lib/api-client';

describe('FeedbackButtons', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts the rating and reports the recomputed arm stats back', async () => {
    const postFeedback = vi.spyOn(api, 'postFeedback').mockResolvedValue({
      reward: 8.06,
      arm: 'vectorless|llama3.2:3b',
      arm_mean_reward: 7.4,
      arm_pulls: 13,
    });
    const onRated = vi.fn();

    render(<FeedbackButtons transactionId="tx-1" onRated={onRated} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark answer helpful' }));

    expect(postFeedback).toHaveBeenCalledWith('tx-1', 1);
    await waitFor(() => expect(onRated).toHaveBeenCalledWith(
      expect.objectContaining({ arm_mean_reward: 7.4, arm_pulls: 13 }),
    ));
  });

  it('reflects the rating immediately and disables further clicks', async () => {
    vi.spyOn(api, 'postFeedback').mockResolvedValue({
      reward: 8.06,
      arm: 'vectorless|llama3.2:3b',
      arm_mean_reward: 7.4,
      arm_pulls: 13,
    });

    render(<FeedbackButtons transactionId="tx-2" />);
    const helpful = screen.getByRole('button', { name: 'Mark answer helpful' });

    await userEvent.click(helpful);

    // A double-clicked button must not be able to double-count.
    await waitFor(() => expect(helpful).toBeDisabled());
    expect(helpful).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Mark answer unhelpful' })).toBeDisabled();
  });

  it('rolls back rather than lying when the post fails', async () => {
    vi.spyOn(api, 'postFeedback').mockRejectedValue(new Error('network down'));

    render(<FeedbackButtons transactionId="tx-3" />);
    const helpful = screen.getByRole('button', { name: 'Mark answer helpful' });

    await userEvent.click(helpful);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/could not record feedback/i),
    );
    // The optimistic state must be reverted: the policy never got this rating.
    expect(helpful).toHaveAttribute('aria-pressed', 'false');
    expect(helpful).not.toBeDisabled();
  });

  it('treats an already-rated 409 as information, not an alarm', async () => {
    vi.spyOn(api, 'postFeedback').mockRejectedValue(
      new api.ApiError('already rated', 409),
    );

    render(<FeedbackButtons transactionId="tx-4" />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark answer helpful' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/already rated/i));
  });

  it('starts disabled when the transaction was already rated', () => {
    render(<FeedbackButtons transactionId="tx-5" existingScore={0} />);

    const unhelpful = screen.getByRole('button', { name: 'Mark answer unhelpful' });
    expect(unhelpful).toHaveAttribute('aria-pressed', 'true');
    expect(unhelpful).toBeDisabled();
  });

  it('renders a legacy -1 rating as unhelpful rather than as unrated', () => {
    // Rows written before the binary contract was fixed store -1. Showing them
    // as unrated would invite a second click the API would then reject.
    render(<FeedbackButtons transactionId="tx-6" existingScore={-1} />);

    const unhelpful = screen.getByRole('button', { name: 'Mark answer unhelpful' });
    expect(unhelpful).toHaveAttribute('aria-pressed', 'true');
    expect(unhelpful).toBeDisabled();
  });
});
