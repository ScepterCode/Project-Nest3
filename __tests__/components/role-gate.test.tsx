import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RoleGate } from '@/components/ui/permission-gate';

const single = jest.fn(async () => ({
  data: { role: 'institution_admin' },
  error: null,
}));
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  }),
}));

function Page() {
  const [name, setName] = useState('');
  return (
    // A new allowedRoles array on every render, as pages write it.
    <RoleGate userId="u1" allowedRoles={['institution_admin']}>
      <input
        aria-label="Name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
    </RoleGate>
  );
}

it('does not re-check (and remount the form) on every keystroke', async () => {
  render(<Page />);
  const input = await screen.findByLabelText('Name');
  fireEvent.change(input, { target: { value: 'A' } });
  fireEvent.change(input, { target: { value: 'Ad' } });
  fireEvent.change(input, { target: { value: 'Ada' } });

  await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Ada'));
  // Same element: the form was never unmounted.
  expect(screen.getByLabelText('Name')).toBe(input);
  expect(single).toHaveBeenCalledTimes(1);
});
