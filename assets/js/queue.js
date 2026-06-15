document.addEventListener("DOMContentLoaded", () => {
    const currentContainer = document.getElementById("current-task-container");
    const pendingContainer = document.getElementById("pending-tasks-container");
    const historyContainer = document.getElementById("history-tasks-container");
    const pendingCount = document.getElementById("pending-count");

    let isPolling = false;

    async function fetchQueueStatus() {
        try {
            const response = await fetch("/api/queue_status");
            const result = await response.json();

            if (result.success) {
                renderCurrentTask(result.current_task);
                renderPendingTasks(result.pending_tasks);
                renderHistoryTasks(result.history);
            }
        } catch (error) {
            console.error("Failed to fetch queue status:", error);
        }
    }

    async function fetchServerStatus() {
        try {
            const response = await fetch("/api/server_status");
            const result = await response.json();

            if (result.success) {
                const cpuSpan = document.getElementById("sys-cpu");
                const ramSpan = document.getElementById("sys-ram");
                if (cpuSpan && ramSpan) {
                    cpuSpan.textContent = `CPU: ${result.cpu_percent}%`;
                    ramSpan.textContent = `RAM: ${result.mem_percent}% (${result.mem_used_gb}GB/${result.mem_total_gb}GB)`;

                    if (result.cpu_percent > 85) cpuSpan.style.color = "#ef4444";
                    else cpuSpan.style.color = "#cbd5e1";

                    if (result.mem_percent > 85) ramSpan.style.color = "#ef4444";
                    else ramSpan.style.color = "#cbd5e1";
                }
            }
        } catch (error) {
            console.error("Failed to fetch server status:", error);
        }
    }

    function renderCurrentTask(task) {
        if (!task) {
            currentContainer.innerHTML = '<div class="empty-message">No task is currently processing.</div>';
            return;
        }

        const date = new Date(task.timestamp * 1000).toLocaleString();
        const progress = task.progress || 0;
        const msg = task.generator_message || "Processing...";

        currentContainer.innerHTML = `
            <div class="task-card">
                <div class="task-header">
                    <span><strong>Task ID:</strong> ${task.id}</span>
                    <span class="task-status status-processing">Processing</span>
                </div>
                <div class="task-body">
                    <div class="task-details">
                        <p><strong>Time:</strong> ${date}</p>
                        <p><strong>Engine:</strong> ${task.params.engine}</p>
                        <p><strong>Mode:</strong> ${task.params.mode}</p>
                        <p><strong>Prompt:</strong> ${task.params.prompt}</p>
                        
                        <div class="task-progress">
                            <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                                <span>${msg}</span>
                                <span>${progress}%</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress}%"></div>
                            </div>
                        </div>
                    </div>
                    <div class="task-actions">
                        <button class="btn btn-danger" onclick="cancelTask('${task.id}')">Cancel Generation</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderPendingTasks(tasks) {
        pendingCount.textContent = tasks.length;

        if (tasks.length === 0) {
            pendingContainer.innerHTML = '<div class="empty-message">Queue is empty.</div>';
            return;
        }

        let html = "";
        tasks.forEach((task, index) => {
            const date = new Date(task.timestamp * 1000).toLocaleString();
            html += `
                <div class="task-card" style="opacity: 0.8; margin-bottom: 15px; padding: 15px;">
                    <div class="task-header">
                        <span><strong>#${index + 1}</strong> | <strong>Task ID:</strong> ${task.id.substring(0, 8)}...</span>
                        <span class="task-status status-pending">Pending</span>
                    </div>
                    <div class="task-body" style="gap: 10px;">
                        <div class="task-details" style="font-size: 0.9rem;">
                            <p><strong>Prompt:</strong> ${task.params.prompt.substring(0, 100)}${task.params.prompt.length > 100 ? '...' : ''}</p>
                            <p><strong>Mode:</strong> ${task.params.mode} | <strong>Engine:</strong> ${task.params.engine}</p>
                        </div>
                        <div class="task-actions">
                            <button class="btn btn-secondary" onclick="cancelTask('${task.id}')">Remove</button>
                        </div>
                    </div>
                </div>
            `;
        });
        pendingContainer.innerHTML = html;
    }

    function renderHistoryTasks(tasks) {
        if (!tasks || tasks.length === 0) {
            historyContainer.innerHTML = '<div class="empty-message">No recent history.</div>';
            return;
        }

        let html = "";
        tasks.forEach(task => {
            const date = new Date(task.timestamp * 1000).toLocaleString();
            const statusClass = task.status === 'completed' ? 'status-completed' :
                (task.status === 'failed' ? 'status-failed' : 'status-cancelled');

            html += `
                <div class="task-card" style="opacity: 0.7; margin-bottom: 15px; padding: 15px;">
                    <div class="task-header">
                        <span><strong>Task ID:</strong> ${task.id.substring(0, 8)}...</span>
                        <span class="task-status ${statusClass}">${task.status.toUpperCase()}</span>
                    </div>
                    <div class="task-body">
                        <div class="task-details" style="font-size: 0.9rem;">
                            <p><strong>Time:</strong> ${date}</p>
                            <p><strong>Prompt:</strong> ${task.params.prompt.substring(0, 100)}${task.params.prompt.length > 100 ? '...' : ''}</p>
                            ${task.error ? `<p style="color: #f87171; margin-top: 5px;"><strong>Error:</strong> ${task.error}</p>` : ''}
                            ${task.result_path ? `<p style="margin-top: 5px;"><a href="${task.result_path}" target="_blank" style="color: #60a5fa;">View Image</a></p>` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        historyContainer.innerHTML = html;
    }

    window.cancelTask = async function (taskId) {
        if (!confirm("Are you sure you want to cancel this task?")) return;

        try {
            const response = await fetch("/api/cancel_task", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ task_id: taskId })
            });
            const result = await response.json();
            if (result.success) {
                // Instantly fetch to update UI
                fetchQueueStatus();
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error("Error cancelling task:", error);
            alert("Failed to cancel task.");
        }
    };

    // Start polling every second
    setInterval(fetchQueueStatus, 1000);
    setInterval(fetchServerStatus, 5000);
    fetchQueueStatus();
    fetchServerStatus();
});
