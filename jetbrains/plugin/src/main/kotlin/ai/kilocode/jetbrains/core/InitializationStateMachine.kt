// SPDX-FileCopyrightText: 2025 Weibo, Inc.
//
// SPDX-License-Identifier: Apache-2.0

package ai.kilocode.jetbrains.core

import com.intellij.openapi.diagnostic.Logger
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

enum class InitializationState {
    NOT_STARTED,
    SOCKET_CONNECTING,
    SOCKET_CONNECTED,
    READY_RECEIVED,
    INIT_DATA_SENT,
    INITIALIZED_RECEIVED,
    RPC_CREATING,
    RPC_CREATED,
    EXTENSION_ACTIVATING,
    EXTENSION_ACTIVATED,
    WEBVIEW_REGISTERING,
    WEBVIEW_REGISTERED,
    WEBVIEW_RESOLVING,
    WEBVIEW_RESOLVED,
    HTML_LOADING,
    HTML_LOADED,
    THEME_INJECTING,
    THEME_INJECTED,
    COMPLETE,
    FAILED;

    fun canTransitionTo(newState: InitializationState): Boolean {
        return when (this) {
            NOT_STARTED -> newState == SOCKET_CONNECTING
            SOCKET_CONNECTING -> newState in setOf(SOCKET_CONNECTED, FAILED)
            SOCKET_CONNECTED -> newState in setOf(READY_RECEIVED, FAILED)
            READY_RECEIVED -> newState in setOf(INIT_DATA_SENT, FAILED)
            INIT_DATA_SENT -> newState in setOf(INITIALIZED_RECEIVED, FAILED)
            INITIALIZED_RECEIVED -> newState in setOf(RPC_CREATING, FAILED)
            RPC_CREATING -> newState in setOf(RPC_CREATED, FAILED)
            RPC_CREATED -> newState in setOf(EXTENSION_ACTIVATING, FAILED)
            EXTENSION_ACTIVATING -> newState in setOf(EXTENSION_ACTIVATED, WEBVIEW_REGISTERING, FAILED)
            EXTENSION_ACTIVATED -> newState in setOf(WEBVIEW_REGISTERING, COMPLETE, FAILED)
            WEBVIEW_REGISTERING -> newState in setOf(WEBVIEW_REGISTERED, FAILED)
            WEBVIEW_REGISTERED -> newState in setOf(WEBVIEW_RESOLVING, FAILED)
            WEBVIEW_RESOLVING -> newState in setOf(WEBVIEW_RESOLVED, FAILED)
            WEBVIEW_RESOLVED -> newState in setOf(HTML_LOADING, FAILED)
            HTML_LOADING -> newState in setOf(HTML_LOADED, FAILED)
            HTML_LOADED -> newState in setOf(THEME_INJECTING, COMPLETE, FAILED)
            THEME_INJECTING -> newState in setOf(THEME_INJECTED, FAILED)
            THEME_INJECTED -> newState in setOf(COMPLETE, FAILED)
            COMPLETE -> false
            FAILED -> false
        }
    }
}

class InitializationStateMachine {
    private val logger = Logger.getInstance(InitializationStateMachine::class.java)
    private val state = AtomicReference(InitializationState.NOT_STARTED)
    private val stateLock = ReentrantLock()
    private val stateTimestamps = ConcurrentHashMap<InitializationState, Long>()
    private val stateCompletions = ConcurrentHashMap<InitializationState, CompletableFuture<Unit>>()
    private val stateListeners = ConcurrentHashMap<InitializationState, MutableList<(InitializationState) -> Unit>>()

    init {
        // Create completion futures for all states
        InitializationState.values().forEach { state ->
            stateCompletions[state] = CompletableFuture()
        }
        // Mark NOT_STARTED as complete immediately
        stateTimestamps[InitializationState.NOT_STARTED] = System.currentTimeMillis()
        stateCompletions[InitializationState.NOT_STARTED]?.complete(Unit)
    }

    fun getCurrentState(): InitializationState = state.get()

    fun transitionTo(newState: InitializationState, context: String = ""): Boolean {
        return stateLock.withLock {
            val currentState = state.get()

            if (!currentState.canTransitionTo(newState)) {
                logger.error("Invalid state transition: $currentState -> $newState (context: $context)")
                return false
            }

            val now = System.currentTimeMillis()
            val previousTimestamp = stateTimestamps[currentState] ?: now
            val duration = now - previousTimestamp

            logger.info("State transition: $currentState -> $newState (took ${duration}ms, context: $context)")

            state.set(newState)
            stateTimestamps[newState] = now

            // Complete the future for this state
            stateCompletions[newState]?.complete(Unit)

            // Notify listeners
            stateListeners[newState]?.forEach { listener ->
                try {
                    listener(newState)
                } catch (e: Exception) {
                    logger.error("Error in state listener for $newState", e)
                }
            }

            // If failed, complete all remaining futures exceptionally
            if (newState == InitializationState.FAILED) {
                val error = IllegalStateException("Initialization failed at state $currentState (context: $context)")
                stateCompletions.values.forEach { future ->
                    if (!future.isDone) {
                        future.completeExceptionally(error)
                    }
                }
            }

            true
        }
    }

    fun waitForState(targetState: InitializationState): CompletableFuture<Unit> {
        val currentState = state.get()

        // If already at or past target state, return completed future
        if (currentState.ordinal >= targetState.ordinal && currentState != InitializationState.FAILED) {
            return CompletableFuture.completedFuture(Unit)
        }

        // If failed, return failed future
        if (currentState == InitializationState.FAILED) {
            return CompletableFuture.failedFuture(
                IllegalStateException("Initialization failed before reaching $targetState")
            )
        }

        // Otherwise return the completion future for that state
        return stateCompletions[targetState] ?: CompletableFuture.failedFuture(
            IllegalStateException("No completion future for state $targetState")
        )
    }

    fun onStateReached(targetState: InitializationState, listener: (InitializationState) -> Unit) {
        stateListeners.computeIfAbsent(targetState) { mutableListOf() }.add(listener)

        // If already at this state, call listener immediately
        if (state.get() == targetState) {
            try {
                listener(targetState)
            } catch (e: Exception) {
                logger.error("Error in immediate state listener for $targetState", e)
            }
        }
    }

    fun getStateDuration(state: InitializationState): Long? {
        val timestamp = stateTimestamps[state] ?: return null
        val nextState = InitializationState.values().getOrNull(state.ordinal + 1)
        val nextTimestamp = nextState?.let { stateTimestamps[it] } ?: System.currentTimeMillis()
        return nextTimestamp - timestamp
    }

    fun generateReport(): String {
        val report = StringBuilder()
        report.appendLine("=== Initialization State Machine Report ===")
        report.appendLine("Current State: ${state.get()}")
        report.appendLine()

        val startTime = stateTimestamps[InitializationState.NOT_STARTED] ?: System.currentTimeMillis()

        InitializationState.values().forEach { state ->
            val timestamp = stateTimestamps[state]
            if (timestamp != null) {
                val elapsed = timestamp - startTime
                val duration = getStateDuration(state)
                report.append("$state: ${elapsed}ms from start")
                if (duration != null) {
                    report.append(" (duration: ${duration}ms)")
                }
                report.appendLine()
            }
        }

        return report.toString()
    }
}
