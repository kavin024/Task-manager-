import { TaskCard } from "./TaskCard"

export const TaskList = ({
  tasks,
  onDelete,
  onEdit,
  onComplete,
  onView,
  loading,
  error,
  isFiltered = false,
  onResetFilters,
}) => {
  if (loading) {
    return (
      <div className="task-list">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="skeleton skeleton-card" style={{ height: 140 }} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">Unable to load tasks</p>
        <p className="empty-state-message">{error}</p>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        {isFiltered ? (
          <>
            <p className="empty-state-title">No tasks match your filters</p>
            <p className="empty-state-message">Try a different search term or status filter.</p>
            {onResetFilters && (
              <button className="btn btn-secondary" onClick={onResetFilters}>
                Clear filters
              </button>
            )}
          </>
        ) : (
          <>
            <p className="empty-state-title">No tasks yet</p>
            <p className="empty-state-message">Add your first task using the form above.</p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onDelete={onDelete} onEdit={onEdit} onComplete={onComplete} onView={onView} />
      ))}
    </div>
  )
}

export default TaskList