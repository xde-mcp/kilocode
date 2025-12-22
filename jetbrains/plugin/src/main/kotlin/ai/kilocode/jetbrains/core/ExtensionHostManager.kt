// Copyright 2009-2025 Weibo, Inc.
// SPDX-FileCopyrightText: 2025 Weibo, Inc.
//
// SPDX-License-Identifier: Apache-2.0

package ai.kilocode.jetbrains.core

import ai.kilocode.jetbrains.editor.EditorAndDocManager
import ai.kilocode.jetbrains.ipc.NodeSocket
import ai.kilocode.jetbrains.ipc.PersistentProtocol
import ai.kilocode.jetbrains.ipc.proxy.ResponsiveState
import ai.kilocode.jetbrains.util.PluginConstants
import ai.kilocode.jetbrains.util.PluginResourceUtil
import ai.kilocode.jetbrains.util.URI
import ai.kilocode.jetbrains.workspace.WorkspaceFileChangeManager
import com.google.gson.Gson
import com.intellij.ide.plugins.PluginManagerCore
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import java.net.Socket
import java.nio.channels.SocketChannel
import java.nio.file.Paths
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Extension host manager, responsible for communication with extension processes.
 * Handles Ready and Initialized messages from extension processes.
 */
class ExtensionHostManager : Disposable {
    companion object {
        val LOG = Logger.getInstance(ExtensionHostManager::class.java)
    }

    private val project: Project
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // Communication protocol
    private var nodeSocket: NodeSocket
    private var protocol: PersistentProtocol? = null

    // RPC manager
    private var rpcManager: RPCManager? = null

    // Extension manager
    private var extensionManager: ExtensionManager? = null

    // Plugin identifier
    private var rooCodeIdentifier: String? = null

    // JSON serialization
    private val gson = Gson()

    // Last diagnostic log time
    private var lastDiagnosticLogTime = 0L

    private var projectPath: String? = null

    // Initialization state management
    private val initializationComplete = CompletableFuture<Boolean>()
    private val messageQueue = ConcurrentLinkedQueue<() -> Unit>()
    
    @Volatile
    private var isReady = false

    // Support Socket constructor
    constructor(clientSocket: Socket, projectPath: String, project: Project) {
        clientSocket.tcpNoDelay = true
        this.nodeSocket = NodeSocket(clientSocket, "extension-host")
        this.projectPath = projectPath
        this.project = project
    }

    // Support SocketChannel constructor
    constructor(clientChannel: SocketChannel, projectPath: String, project: Project) {
        this.nodeSocket = NodeSocket(clientChannel, "extension-host")
        this.projectPath = projectPath
        this.project = project
    }

    /**
     * Start communication with the extension process.
     */
    fun start() {
        try {
            // Initialize extension manager
            extensionManager = ExtensionManager()
            val extensionPath = PluginResourceUtil.getResourcePath(PluginConstants.PLUGIN_ID, PluginConstants.PLUGIN_CODE_DIR)
            rooCodeIdentifier = extensionPath?.let { extensionManager!!.registerExtension(it).identifier.value }
            // Create protocol
            protocol = PersistentProtocol(
                PersistentProtocol.PersistentProtocolOptions(
                    socket = nodeSocket,
                    initialChunk = null,
                    loadEstimator = null,
                    sendKeepAlive = true,
                ),
                this::handleMessage,
            )

            LOG.info("ExtensionHostManager started successfully")
        } catch (e: Exception) {
            LOG.error("Failed to start ExtensionHostManager", e)
            dispose()
        }
    }

    /**
     * Wait for extension host to be ready.
     * @return CompletableFuture that completes when extension host is initialized.
     */
    fun waitForReady(): CompletableFuture<Boolean> {
        return initializationComplete
    }

    /**
     * Queue a message to be sent after initialization.
     * If already initialized, executes immediately.
     * @param message The message function to execute.
     */
    fun queueMessage(message: () -> Unit) {
        if (isReady) {
            try {
                message()
            } catch (e: Exception) {
                LOG.error("Error executing queued message", e)
            }
        } else {
            messageQueue.offer(message)
            LOG.debug("Message queued, total queued: ${messageQueue.size}")
        }
    }

    /**
     * Get RPC responsive state.
     * @return Responsive state, or null if RPC manager is not initialized.
     */
    fun getResponsiveState(): ResponsiveState? {
        val currentTime = System.currentTimeMillis()
        // Limit diagnostic log frequency, at most once every 60 seconds
        val shouldLogDiagnostics = currentTime - lastDiagnosticLogTime > 60000
        if (rpcManager == null) {
            if (shouldLogDiagnostics) {
                LOG.debug("Unable to get responsive state: RPC manager is not initialized")
                lastDiagnosticLogTime = currentTime
            }
            return null
        }
        // Log connection diagnostic information
        if (shouldLogDiagnostics) {
            val socketInfo = buildString {
                append("NodeSocket: ")
                append(if (nodeSocket.isClosed()) "closed" else "active")
                append(", input stream: ")
                append(if (nodeSocket.isInputClosed()) "closed" else "normal")
                append(", output stream: ")
                append(if (nodeSocket.isOutputClosed()) "closed" else "normal")
                append(", disposed=")
                append(nodeSocket.isDisposed())
            }

            val protocolInfo = protocol?.let { proto ->
                "Protocol: ${if (proto.isDisposed()) "disposed" else "active"}"
            } ?: "Protocol is null"
            LOG.debug("Connection diagnostics: $socketInfo, $protocolInfo")
            lastDiagnosticLogTime = currentTime
        }
        return rpcManager?.getRPCProtocol()?.responsiveState
    }

    /**
     * Handle messages from the extension process.
     */
    private fun handleMessage(data: ByteArray) {
        // Check if data is a single-byte message (extension host protocol message)
        if (data.size == 1) {
            // Try to parse as extension host message type

            when (ExtensionHostMessageType.fromData(data)) {
                ExtensionHostMessageType.Ready -> handleReadyMessage()
                ExtensionHostMessageType.Initialized -> handleInitializedMessage()
                ExtensionHostMessageType.Terminate -> LOG.info("Received Terminate message")
                null -> LOG.debug("Received unknown message type: ${data.contentToString()}")
            }
        } else {
            LOG.debug("Received message with length ${data.size}, not handling as extension host message")
        }
    }

    /**
     * Handle Ready message, send initialization data.
     */
    private fun handleReadyMessage() {
        LOG.info("Received Ready message from extension host")

        try {
            // Build initialization data
            val initData = createInitData()

            // Send initialization data
            val jsonData = gson.toJson(initData).toByteArray()

            protocol?.send(jsonData)
            LOG.info("Sent initialization data to extension host")
        } catch (e: Exception) {
            LOG.error("Failed to handle Ready message", e)
        }
    }

    /**
     * Handle Initialized message, create RPC manager and activate plugin.
     */
    private fun handleInitializedMessage() {
        LOG.info("Received Initialized message from extension host")

        try {
            // Get protocol
            val protocol = this.protocol ?: throw IllegalStateException("Protocol is not initialized")
            val extensionManager = this.extensionManager ?: throw IllegalStateException("ExtensionManager is not initialized")

            // Create RPC manager
            rpcManager = RPCManager(protocol, extensionManager, null, project)

            // Start initialization process
            rpcManager?.startInitialize()

            // Start file monitoring
            project.getService(WorkspaceFileChangeManager::class.java)

            // Activate RooCode plugin
            val rooCodeId = rooCodeIdentifier ?: throw IllegalStateException("RooCode identifier is not initialized")
            extensionManager.activateExtension(rooCodeId, rpcManager!!.getRPCProtocol())
                .whenComplete { _, error ->
                    if (error != null) {
                        LOG.error("Failed to activate RooCode plugin", error)
                        initializationComplete.complete(false)
                    } else {
                        LOG.info("RooCode plugin activated successfully")
                        
                        // Mark as ready and process queued messages
                        isReady = true
                        initializationComplete.complete(true)
                        
                        // Process all queued messages
                        val queueSize = messageQueue.size
                        LOG.info("Processing $queueSize queued messages")
                        var processedCount = 0
                        while (messageQueue.isNotEmpty()) {
                            messageQueue.poll()?.let { message ->
                                try {
                                    message()
                                    processedCount++
                                } catch (e: Exception) {
                                    LOG.error("Error processing queued message", e)
                                }
                            }
                        }
                        LOG.info("Processed $processedCount/$queueSize queued messages")
                        
                        // Now safe to initialize editors
                        project.getService(EditorAndDocManager::class.java).initCurrentIdeaEditor()
                    }
                }

            LOG.info("Initialized extension host")
        } catch (e: Exception) {
            LOG.error("Failed to handle Initialized message", e)
            initializationComplete.complete(false)
        }
    }

    /**
     * Create initialization data.
     * Corresponds to the initData object in main.js.
     */
    private fun createInitData(): Map<String, Any?> {
        val pluginDir = getPluginDir()
        val basePath = projectPath

        return mapOf(
            "commit" to "development",
            "version" to getIDEVersion(),
            "quality" to null,
            "parentPid" to ProcessHandle.current().pid(),
            "environment" to mapOf(
                "isExtensionDevelopmentDebug" to false,
                "appName" to getCurrentIDEName(),
                "appHost" to "node",
                "appLanguage" to "en",
                "appUriScheme" to "vscode",
                "appRoot" to uriFromPath(pluginDir),
                "globalStorageHome" to uriFromPath(Paths.get(System.getProperty("user.home"), ".kilocode", "globalStorage").toString()),
                "workspaceStorageHome" to uriFromPath(Paths.get(System.getProperty("user.home"), ".kilocode", "workspaceStorage").toString()),
                "extensionDevelopmentLocationURI" to null,
                "extensionTestsLocationURI" to null,
                "useHostProxy" to false,
                "skipWorkspaceStorageLock" to false,
                "isExtensionTelemetryLoggingOnly" to false,
            ),
            "workspace" to mapOf(
                "id" to "intellij-workspace",
                "name" to "IntelliJ Workspace",
                "transient" to false,
                "configuration" to null,
                "isUntitled" to false,
            ),
            "remote" to mapOf(
                "authority" to null,
                "connectionData" to null,
                "isRemote" to false,
            ),
            "extensions" to mapOf<String, Any>(
                "versionId" to 1,
                "allExtensions" to (extensionManager?.getAllExtensionDescriptions() ?: emptyList<Any>()),
                "myExtensions" to (extensionManager?.getAllExtensionDescriptions()?.map { it.identifier } ?: emptyList<Any>()),
                "activationEvents" to (
                    extensionManager?.getAllExtensionDescriptions()?.associate { ext ->
                        ext.identifier.value to (ext.activationEvents ?: emptyList<String>())
                    } ?: emptyMap()
                    ),
            ),
            "telemetryInfo" to mapOf(
                "sessionId" to "intellij-session",
                "machineId" to "intellij-machine",
                "sqmId" to "",
                "devDeviceId" to "",
                "firstSessionDate" to java.time.Instant.now().toString(),
                "msftInternal" to false,
            ),
            "logLevel" to 0, // Info level
            "loggers" to emptyList<Any>(),
            "logsLocation" to uriFromPath(Paths.get(pluginDir, "logs").toString()),
            "autoStart" to true,
            "consoleForward" to mapOf(
                "includeStack" to false,
                "logNative" to false,
            ),
            "uiKind" to 1, // Desktop
        )
    }

    /**
     * Get current IDE name.
     */
    private fun getCurrentIDEName(): String {
        val applicationInfo = ApplicationInfo.getInstance()
        val productCode = applicationInfo.build.productCode
        val version = applicationInfo.shortVersion ?: "1.0.0"

        // Return in the format: wrapper|jetbrains|productCode
        val result = "wrapper|jetbrains|$productCode|$version"
        return result
    }

    /**
     * Get current IDE version.
     */
    private fun getIDEVersion(): String {
        val applicationInfo = ApplicationInfo.getInstance()
        val version = applicationInfo.shortVersion ?: "1.0.0"
        LOG.info("Get IDE version: $version")

        val pluginVersion = PluginManagerCore.getPlugin(PluginId.getId(PluginConstants.PLUGIN_ID))?.version
        if (pluginVersion != null) {
            val fullVersion = "$version, $pluginVersion"
            LOG.info("Get IDE version and plugin version: $fullVersion")
            return fullVersion
        }

        return version
    }

    /**
     * Get plugin directory.
     */
    private fun getPluginDir(): String {
        return PluginResourceUtil.getResourcePath(PluginConstants.PLUGIN_ID, "")
            ?: throw IllegalStateException("Unable to get plugin directory")
    }

    /**
     * Create URI object.
     */
    private fun uriFromPath(path: String): URI {
        return URI.file(path)
    }

    /**
     * Resource disposal.
     */
    override fun dispose() {
        LOG.info("Disposing ExtensionHostManager")

        // Mark as not ready to prevent new messages
        isReady = false
        
        // Clear message queue
        val remainingMessages = messageQueue.size
        if (remainingMessages > 0) {
            LOG.warn("Disposing with $remainingMessages unprocessed messages in queue")
            messageQueue.clear()
        }
        
        // Complete initialization future if not already done
        if (!initializationComplete.isDone) {
            initializationComplete.complete(false)
        }

        // Cancel coroutines
        coroutineScope.cancel()

        // Release RPC manager
        rpcManager = null

        // Release protocol
        protocol?.dispose()
        protocol = null

        // Release socket
        nodeSocket.dispose()

        LOG.info("ExtensionHostManager disposed")
    }
}
