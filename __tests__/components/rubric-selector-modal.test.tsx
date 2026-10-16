import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RubricSelectorModal } from '@/components/rubric-selector-modal';

const template = {
  id: 'tpl-1',
  name: 'Foundation: Walk cycle',
  description: '',
  criteria_count: 3,
  max_points: 15,
  status: 'active',
};
const mine = {
  ...template,
  id: 'mine-1',
  name: 'My quick check',
  criteria_count: 1,
  max_points: 5,
};

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              id: 'tpl-1',
              name: 'Foundation: Walk cycle',
              description: '',
              rubric_criteria: [],
            },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
jest.mock('@/lib/toast', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
  errorMessage: (e: unknown) => String(e),
}));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () =>
      url === '/api/rubrics'
        ? { rubrics: [mine], templates: [template] }
        : { success: true },
  }));
});

it('offers programme templates first and attaches one like any rubric', async () => {
  const onSelected = jest.fn();
  render(
    <RubricSelectorModal assignmentId="a1" onRubricSelected={onSelected} />
  );
  fireEvent.click(screen.getByText('Add Rubric'));

  expect(await screen.findByText('Programme templates')).toBeInTheDocument();
  expect(screen.getByText('Foundation: Walk cycle')).toBeInTheDocument();
  expect(screen.getByText('My quick check')).toBeInTheDocument();

  fireEvent.click(screen.getByText('Use'));
  await waitFor(() => expect(onSelected).toHaveBeenCalled());
  const attach = fetchMock.mock.calls.find(
    ([url]) => url === '/api/assignments/a1/rubric'
  );
  expect(JSON.parse(attach![1].body).rubric.id).toBe('tpl-1');
});
