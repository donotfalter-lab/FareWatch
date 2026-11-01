import RecommendationCard from './RecommendationCard.jsx'

export default function RecommendationList({ recommendations, onDeleted }) {
  if (recommendations.length === 0) {
    return <p className="muted list-empty">No recommendations yet. Ask the AI above.</p>
  }

  return (
    <div className="recommendation-list">
      {recommendations.map((recommendation) => (
        <RecommendationCard
          key={recommendation.id}
          recommendation={recommendation}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  )
}
