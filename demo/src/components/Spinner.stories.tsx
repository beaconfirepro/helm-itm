import type { Meta, StoryObj } from '@storybook/react-vite';
import Spinner from './Spinner';

// Hand-written story. The addon must leave Spinner alone and let this coexist.
const meta: Meta<typeof Spinner> = {
  title: 'Components/Spinner',
  component: Spinner,
  tags: ['manual'],
};
export default meta;

type Story = StoryObj<typeof Spinner>;

export const Small: Story = { args: { size: 16 } };
export const Large: Story = { args: { size: 48 } };
