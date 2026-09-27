"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "framer-motion";
import { Plus, X } from "lucide-react";
import CardMenu from "./CardMenu";
import NewTaskButton from "./NewTaskButton";
import TaskBubble, { type TaskBubbleTask } from "./TaskBubble";
import ThreadDashboard from "./ThreadDashboard";
import { useLongPress } from "./useLongPress";
import { ADD_SLOT_ID, CENTER_RADIUS, type ClusterLayout } from "./clusterLayout";
import { COLLAPSED_DIAMETER } from "./threadLayout";
import { summarizeThread, threadAriaLabel } from "./threadSummary";

export type ThreadClusterData = {
  thread: { id: string; name: string; categoryColor: string };
  tasks: TaskBubbleTask[];
  layout: ClusterLayout;
  open: boolean;
  dimmed: boolean;
  canEditMeta: boolean;
  canCloseOrDelete: boolean;
  canEditTasks: boolean;
  onToggle: () => void;
  onHoverChange: (hovered: boolean) => void;
  onOpenTask: (taskId: string) => void;
  onRenameTask: (taskId: string) => void;
  onMoveTask: (taskId: string) => void;
  onLinkTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onRename: () => void;
  onChangeColor: () => void;
  onCloseThread: () => void;
  onDeleteThread: () => void;
  onViewCatchUp: () => void;
  onCreateTask: (input: { title: string; description?: string; dueDate?: Date }) => void;
};

const CLUSTER_MARGIN = 16;
const SPRING: Transition = { type: "spring", stiffness: 260, damping: 24 };
const FADE: Transition = { duration: 0.15 };
const HALF = COLLAPSED_DIAMETER / 2;

export function clusterNodeDiameter(open: boolean, layout: ClusterLayout): number {
  return open ? Math.max(COLLAPSED_DIAMETER, 2 * (layout.radius + CLUSTER_MARGIN)) : COLLAPSED_DIAMETER;
}

// One React Flow node per thread. Collapsed and open states live in one
// component tree so opening/closing is a single continuous animation: the
// dashboard bubble shrinks into the center as the × grows out of it, and
// task bubbles spring out from (and back into) the center. Every motion is
// a spring from current values, so reversing mid-animation never snaps.
// The node is rendered with nodeOrigin [0.5, 0.5], so growing the node
// keeps it centred on the thread's position.
export default function ThreadClusterNode({ data }: { id: string; data: ThreadClusterData }) {
  const reduced = useReducedMotion();
  const [closeMenuOpen, setCloseMenuOpen] = useState(false);
  const closeLongPress = useLongPress(() => setCloseMenuOpen(true));
  const { thread, tasks, layout, open } = data;
  const color = thread.categoryColor;
  const summary = summarizeThread(tasks);
  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  const transition = reduced ? FADE : SPRING;
  const count = layout.bubbles.length;

  const threadMenu = {
    variant: "thread" as const,
    onRename: data.onRename,
    onChangeColor: data.onChangeColor,
    onClose: data.onCloseThread,
    onDelete: data.onDeleteThread,
    onViewCatchUp: data.onViewCatchUp,
    canEditMeta: data.canEditMeta,
    canCloseOrDelete: data.canCloseOrDelete,
  };

  const size = clusterNodeDiameter(open, layout);

  return (
    <motion.div
      className="relative"
      initial={false}
      animate={{ width: size, height: size, opacity: data.dimmed ? 0.5 : 1 }}
      transition={transition}
      onPointerEnter={() => data.onHoverChange(true)}
      onPointerLeave={() => data.onHoverChange(false)}
    >
      <motion.div
        className="absolute left-1/2 top-1/2"
        style={{ width: COLLAPSED_DIAMETER, height: COLLAPSED_DIAMETER, marginLeft: -HALF, marginTop: -HALF }}
        initial={false}
        animate={{ scale: open ? 0.25 : 1, opacity: open ? 0 : 1 }}
        transition={transition}
      >
        <button
          type="button"
          aria-label={threadAriaLabel(thread.name, summary)}
          aria-hidden={open || undefined}
          tabIndex={open ? -1 : 0}
          onClick={data.onToggle}
          className={`relative flex h-full w-full flex-col items-center justify-center rounded-full border text-fg outline-none backdrop-blur-md transition-transform duration-300 ease-[var(--ease-out-soft)] hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-accent/60 ${
            open ? "pointer-events-none" : ""
          }`}
          style={{
            background: `color-mix(in srgb, ${color} 18%, var(--surface))`,
            borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
            boxShadow: `0 10px 30px -12px color-mix(in srgb, ${color} 60%, transparent)`,
          }}
        >
          <ThreadDashboard name={thread.name} color={color} summary={summary} />
        </button>
        {!open && (
          <div className="nodrag absolute right-3 top-3">
            <CardMenu {...threadMenu} />
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="close"
            className="absolute left-1/2 top-1/2"
            style={{
              width: CENTER_RADIUS * 2,
              height: CENTER_RADIUS * 2,
              marginLeft: -CENTER_RADIUS,
              marginTop: -CENTER_RADIUS,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={transition}
          >
            <button
              type="button"
              aria-label={`Close ${thread.name}`}
              {...closeLongPress.handlers}
              onClick={() => {
                if (closeLongPress.consumeLongPress()) return;
                data.onToggle();
              }}
              className="flex h-full w-full items-center justify-center rounded-full border bg-surface text-fg outline-none transition-transform duration-200 hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent/60"
              style={{ borderColor: `color-mix(in srgb, ${color} 60%, transparent)` }}
            >
              <X size={18} strokeWidth={2.4} />
            </button>
            {closeMenuOpen && (
              <div className="nodrag absolute left-full top-0">
                <CardMenu {...threadMenu} hideTrigger open onOpenChange={setCloseMenuOpen} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open &&
          layout.bubbles.map((b, i) => {
            const task = tasksById.get(b.id);
            if (b.id !== ADD_SLOT_ID && !task) return null;
            return (
              <motion.div
                key={b.id}
                className="nodrag absolute left-1/2 top-1/2"
                style={{ marginLeft: -b.r, marginTop: -b.r }}
                initial={reduced ? { x: b.x, y: b.y, opacity: 0 } : { x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: b.x,
                  y: b.y,
                  scale: 1,
                  opacity: 1,
                  transition: { ...transition, delay: reduced ? 0 : Math.min(i * 0.025, 0.3) },
                }}
                exit={
                  reduced
                    ? { opacity: 0, transition }
                    : {
                        x: 0,
                        y: 0,
                        scale: 0,
                        opacity: 0,
                        transition: { ...transition, delay: Math.min((count - i) * 0.015, 0.2) },
                      }
                }
              >
                {b.id === ADD_SLOT_ID ? (
                  <NewTaskButton
                    threadId={thread.id}
                    threadName={thread.name}
                    onCreate={data.onCreateTask}
                    renderTrigger={(openDialog) => (
                      <button
                        type="button"
                        aria-label={`Add task to ${thread.name}`}
                        onClick={openDialog}
                        className="flex items-center justify-center rounded-full border border-dashed text-fg/60 outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60"
                        style={{
                          width: b.r * 2,
                          height: b.r * 2,
                          borderColor: `color-mix(in srgb, ${color} 60%, transparent)`,
                        }}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  />
                ) : (
                  <TaskBubble
                    task={task!}
                    r={b.r}
                    color={color}
                    compact={b.ring >= 2}
                    onOpen={() => data.onOpenTask(b.id)}
                    onRename={() => data.onRenameTask(b.id)}
                    onMoveToThread={() => data.onMoveTask(b.id)}
                    onLinkSecondaryThread={() => data.onLinkTask(b.id)}
                    onDelete={() => data.onDeleteTask(b.id)}
                  />
                )}
              </motion.div>
            );
          })}
      </AnimatePresence>
    </motion.div>
  );
}
