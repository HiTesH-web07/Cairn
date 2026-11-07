import AuthScreen from '@/components/AuthScreen';

export default async function Page({ params }) {
  const { token } = await params;
  return <AuthScreen mode="join" token={token} />;
}
