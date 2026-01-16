package ai.kilocode.jetbrains.monitoring

import com.intellij.openapi.Disposable
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Test suite for DisposableTracker to validate resource tracking
 * and cleanup functionality.
 */
class DisposableTrackerTest {
    
    @After
    fun cleanup() {
        // Clear all tracked disposables after each test
        DisposableTracker.getActiveDisposables().forEach {
            DisposableTracker.unregister(it)
        }
    }
    
    /**
     * Verifies that disposables can be registered and tracked.
     * This is essential for monitoring resource lifecycle.
     */
    @Test
    fun `should register disposable`() {
        val disposable = Disposable { }
        DisposableTracker.register("test-disposable", disposable)
        
        assertTrue(
            DisposableTracker.getActiveDisposables().contains("test-disposable"),
            "Disposable should be registered"
        )
    }
    
    /**
     * Validates that disposables can be unregistered from tracking.
     * Proper unregistration is critical for accurate resource monitoring.
     */
    @Test
    fun `should unregister disposable`() {
        val disposable = Disposable { }
        DisposableTracker.register("test-disposable", disposable)
        DisposableTracker.unregister("test-disposable")
        
        assertFalse(
            DisposableTracker.getActiveDisposables().contains("test-disposable"),
            "Disposable should be unregistered"
        )
    }
    
    /**
     * Tests that multiple disposables can be tracked simultaneously.
     * This validates the tracker can handle multiple resources.
     */
    @Test
    fun `should track multiple disposables`() {
        val disposable1 = Disposable { }
        val disposable2 = Disposable { }
        
        DisposableTracker.register("test-1", disposable1)
        DisposableTracker.register("test-2", disposable2)
        
        val active = DisposableTracker.getActiveDisposables()
        assertTrue("Disposable 1 should be tracked", active.contains("test-1"))
        assertTrue("Disposable 2 should be tracked", active.contains("test-2"))
        assertTrue("Should have at least 2 disposables", active.size >= 2)
    }
    
    /**
     * Ensures getActiveCount returns the correct number of tracked disposables.
     * This is used for monitoring resource usage.
     */
    @Test
    fun `should return correct active count`() {
        val initialCount = DisposableTracker.getActiveCount()
        
        val disposable1 = Disposable { }
        val disposable2 = Disposable { }
        val disposable3 = Disposable { }
        
        DisposableTracker.register("test-1", disposable1)
        DisposableTracker.register("test-2", disposable2)
        DisposableTracker.register("test-3", disposable3)
        
        assertEquals("Active count should increase by 3", initialCount + 3, DisposableTracker.getActiveCount())
        
        DisposableTracker.unregister("test-1")
        
        assertEquals("Active count should decrease by 1", initialCount + 2, DisposableTracker.getActiveCount())
    }
    
    /**
     * Validates that logActiveDisposables doesn't throw exceptions.
     * This method is used for debugging resource leaks.
     */
    @Test
    fun `should log active disposables without errors`() {
        val disposable = Disposable { }
        DisposableTracker.register("test-disposable", disposable)
        
        DisposableTracker.logActiveDisposables()
        // Should not throw - test passes if no exception
        assertTrue("Active disposables logged successfully", true)
    }
    
    /**
     * Tests that re-registering with the same name replaces the old disposable.
     * This prevents duplicate tracking entries.
     */
    @Test
    fun `should replace disposable on re-registration`() {
        val disposable1 = Disposable { }
        val disposable2 = Disposable { }
        
        DisposableTracker.register("test-disposable", disposable1)
        val countAfterFirst = DisposableTracker.getActiveCount()
        
        DisposableTracker.register("test-disposable", disposable2)
        val countAfterSecond = DisposableTracker.getActiveCount()
        
        assertEquals("Count should remain the same after re-registration", countAfterFirst, countAfterSecond)
        assertTrue(
            DisposableTracker.getActiveDisposables().contains("test-disposable"),
            "Disposable should still be tracked"
        )
    }
    
    /**
     * Verifies that disposeAll properly cleans up all tracked resources.
     * This is used during emergency shutdown scenarios.
     */
    @Test
    fun `should dispose all tracked resources`() {
        var disposed1 = false
        var disposed2 = false
        var disposed3 = false
        
        val disposable1 = Disposable { disposed1 = true }
        val disposable2 = Disposable { disposed2 = true }
        val disposable3 = Disposable { disposed3 = true }
        
        DisposableTracker.register("test-1", disposable1)
        DisposableTracker.register("test-2", disposable2)
        DisposableTracker.register("test-3", disposable3)
        
        DisposableTracker.disposeAll()
        
        assertTrue("Disposable 1 should be disposed", disposed1)
        assertTrue("Disposable 2 should be disposed", disposed2)
        assertTrue("Disposable 3 should be disposed", disposed3)
        assertEquals("All disposables should be cleared", 0, DisposableTracker.getActiveCount())
    }
    
    /**
     * Tests that disposeAll handles exceptions gracefully.
     * This ensures one failing disposal doesn't prevent others.
     */
    @Test
    fun `should handle disposal exceptions gracefully`() {
        var disposed1 = false
        var disposed3 = false
        
        val disposable1 = Disposable { disposed1 = true }
        val disposable2 = Disposable { throw RuntimeException("Test exception") }
        val disposable3 = Disposable { disposed3 = true }
        
        DisposableTracker.register("test-1", disposable1)
        DisposableTracker.register("test-2", disposable2)
        DisposableTracker.register("test-3", disposable3)
        
        // Should not throw even though disposable2 throws
        DisposableTracker.disposeAll()
        
        assertTrue("Disposable 1 should be disposed", disposed1)
        assertTrue("Disposable 3 should be disposed", disposed3)
        assertEquals("All disposables should be cleared", 0, DisposableTracker.getActiveCount())
    }
}
