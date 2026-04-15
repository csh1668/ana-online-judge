import { WorkshopComingSoon } from "../_components/coming-soon";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <WorkshopComingSoon id={id} phase="P5" title="체커" />;
}
