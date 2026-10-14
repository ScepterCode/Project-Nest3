import { render, screen, fireEvent } from '@testing-library/react';
import { InstitutionAdminOnboarding } from '@/components/onboarding/institution-admin-onboarding';

const next = () => fireEvent.click(screen.getByText('Next'));

it('collects only what it uses and hands it over at the end', () => {
  const onComplete = jest.fn();
  render(
    <InstitutionAdminOnboarding
      onComplete={onComplete}
      userName="Ada"
      userEmail="ada@academy.test"
    />
  );

  // Step 1: name required
  expect(screen.getByText('Next')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('First name'), {
    target: { value: 'Ada' },
  });
  fireEvent.change(screen.getByLabelText('Last name'), {
    target: { value: 'Obi' },
  });
  fireEvent.change(screen.getByLabelText(/Job title/), {
    target: { value: 'Head of Animation' },
  });
  next();

  // Step 2: school name required; contact email pre-filled
  expect(screen.getByLabelText('Contact email')).toHaveValue(
    'ada@academy.test'
  );
  expect(screen.getByText('Next')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('School name'), {
    target: { value: 'Lagos Animation Academy' },
  });
  next();

  // Step 3: departments are optional; pick one and add a custom one
  fireEvent.click(screen.getByText('2D Animation'));
  fireEvent.change(screen.getByLabelText('Add another'), {
    target: { value: 'Stop Motion' },
  });
  fireEvent.keyDown(screen.getByLabelText('Add another'), { key: 'Enter' });
  next();

  // Step 4: review shows what will be created
  expect(screen.getByText('Lagos Animation Academy')).toBeInTheDocument();
  expect(screen.getByText('2D Animation, Stop Motion')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Create my school'));

  expect(onComplete).toHaveBeenCalledWith({
    firstName: 'Ada',
    lastName: 'Obi',
    jobTitle: 'Head of Animation',
    institutionName: 'Lagos Animation Academy',
    institutionType: '',
    institutionSize: '',
    contactEmail: 'ada@academy.test',
    contactPhone: '',
    departments: ['2D Animation', 'Stop Motion'],
  });
});

it('no longer asks about responsibilities, experience or priorities', () => {
  render(<InstitutionAdminOnboarding onComplete={jest.fn()} />);
  expect(screen.queryByText(/responsibilit/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/experience/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/priorit/i)).not.toBeInTheDocument();
});
