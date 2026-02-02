import { useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
} from "@/components/ui"
import { vscode } from "@/utils/vscode"
import { AlertDialogProps } from "@radix-ui/react-alert-dialog"
import { useTaskWithId } from "@/kilocode/hooks/useTaskHistory"

interface BatchDeleteTaskDialogProps extends AlertDialogProps {
	taskIds: string[]
}

export const BatchDeleteTaskDialog = ({ taskIds, ...props }: BatchDeleteTaskDialogProps) => {
	const { t } = useAppTranslation()
	const { data: tasks } = useTaskWithId(taskIds) // kilocode_change
	const { onOpenChange } = props

	const favoritedTasks = tasks?.filter((task) => taskIds.includes(task.id) && task.isFavorited) ?? [] // kilocode_change
	const hasFavoritedTasks = favoritedTasks.length > 0 // kilocode_change
	const nonFavoritedTaskIds = taskIds.filter((id) => !favoritedTasks.some((task) => task.id === id)) // kilocode_change
	const hasNonFavoritedTasks = nonFavoritedTaskIds.length > 0 // kilocode_change

	const onDeleteAll = useCallback(() => {
		if (taskIds.length > 0) {
			vscode.postMessage({ type: "deleteMultipleTasksWithIds", ids: taskIds, excludeFavorites: false })
		}
		onOpenChange?.(false)
	}, [taskIds, onOpenChange])

	// kilocode_change start
	const onDeleteNonFavorited = useCallback(() => {
		if (nonFavoritedTaskIds.length > 0) {
			vscode.postMessage({ type: "deleteMultipleTasksWithIds", ids: nonFavoritedTaskIds, excludeFavorites: true })
		}
		onOpenChange?.(false)
	}, [nonFavoritedTaskIds, onOpenChange])
	// kilocode_change end

	return (
		<AlertDialog {...props}>
			<AlertDialogContent className="max-w-md">
				<AlertDialogHeader>
					<AlertDialogTitle>{t("history:deleteTasks")}</AlertDialogTitle>
					<AlertDialogDescription className="text-vscode-foreground">
						<div className="mb-2">{t("history:confirmDeleteTasks", { count: taskIds.length })}</div>
						{/* kilocode_change start */}
						{hasFavoritedTasks && (
							<div className="text-yellow-500 mb-2">
								{t("history:deleteTasksFavoritedWarning", { count: favoritedTasks.length })}
							</div>
						)}
						{/* kilocode_change end */}
						<div className="text-vscode-editor-foreground bg-vscode-editor-background rounded text-sm">
							{t("history:deleteTasksWarning")}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-between items-end">
					{/* kilocode_change start */}
					{/* Left side: Delete buttons stacked vertically */}
					<div className="flex flex-col gap-2">
						{hasFavoritedTasks ? (
							<>
								{hasNonFavoritedTasks && (
									<Button
										variant="primary"
										onClick={onDeleteNonFavorited}
										className="flex justify-start">
										<span className="codicon codicon-trash size-4 align-middle"></span>
										{t("history:deleteNonFavorites", { count: nonFavoritedTaskIds.length })}
									</Button>
								)}
								<Button variant="destructive" onClick={onDeleteAll} className="flex justify-start">
									<span className="codicon codicon-trash size-4 align-middle"></span>
									{t("history:deleteAllItems", { count: taskIds.length })}
								</Button>
							</>
						) : (
							<Button variant="destructive" onClick={onDeleteAll}>
								<span className="codicon codicon-trash size-4 align-middle"></span>
								{t("history:deleteItems", { count: taskIds.length })}
							</Button>
						)}
					</div>
					{/* Right side: Cancel button aligned with bottom */}
					<AlertDialogCancel asChild>
						<Button variant="secondary">{t("history:cancel")}</Button>
					</AlertDialogCancel>
					{/* kilocode_change end */}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
