import { useNavigate } from 'react-router';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-200">404</h1>
        <p className="mt-2 text-lg text-gray-600">Page not found</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
